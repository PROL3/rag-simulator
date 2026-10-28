import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const port = process.env.PORT || 3001;

app.use(
  cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173" }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_req, res) => {
  const serviceUrl =
    process.env.PYTHON_SERVICE_HEALTH_URL || "http://127.0.0.1:8000/health";
  try {
    const response = await fetch(serviceUrl, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`Python service returned ${response.status}`);
    return res.json({ serviceOnline: true, ...(await response.json()) });
  } catch {
    return res.json({
      serviceOnline: false,
      status: "offline",
      indexed: false,
      documents: [],
      document_count: 0,
      chunk_count: 0,
      session: { answered_queries: 0, average_retrieval_ms: null, average_generation_ms: null },
    });
  }
});

app.post("/api/ingest", async (_req, res) => {
  const serviceUrl =
    process.env.PYTHON_SERVICE_INGEST_URL || "http://127.0.0.1:8000/ingest";
  try {
    const response = await fetch(serviceUrl, {
      method: "POST",
      signal: AbortSignal.timeout(300_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status >= 500 ? 502 : response.status).json({
        error: payload.detail || "Could not rebuild the PDF index.",
      });
    }
    return res.json(payload);
  } catch (error) {
    console.error("Python ingestion service request failed:", error);
    return res.status(502).json({ error: "The Python RAG service could not be reached." });
  }
});

app.post("/api/chat", async (req, res) => {
  const { message, mode, provider = "ollama" } = req.body ?? {};
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "A non-empty message is required." });
  }
  if (mode !== "mock" && mode !== "real") {
    return res
      .status(400)
      .json({ error: 'Mode must be either "mock" or "real".' });
  }
  if (provider !== "ollama" && provider !== "openai") {
    return res.status(400).json({ error: 'Provider must be either "ollama" or "openai".' });
  }

  if (mode === "mock") {
    return res.json({
      mode: "mock",
      reply: `This is a sample reply for: “${message.trim()}”\n\nMock Mode does not search your indexed PDFs. Switch to Real RAG Mode to retrieve passages from your documents.`,
      sources: [],
      note: "Mock reply — no documents were searched.",
    });
  }

  try {
    const serviceUrl =
      process.env.PYTHON_SERVICE_URL || "http://127.0.0.1:8000/ask";
    const result = await fetch(serviceUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: message.trim(), provider }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!result.ok) {
      const details = await result.text();
      console.error(`Python RAG service returned ${result.status}:`, details);
      let errorMessage = "The RAG service could not answer this question.";
      try {
        const parsed = JSON.parse(details);
        if (typeof parsed.detail === "string") errorMessage = parsed.detail;
      } catch {
        // Keep the generic error message if the Python service did not return JSON.
      }
      return res
        .status(result.status === 400 || result.status === 422 ? result.status : 502)
        .json({ error: errorMessage });
    }
    const ragResponse = await result.json();
    return res.json({
      mode: "real",
      reply: ragResponse.answer,
      sources: ragResponse.sources ?? [],
      metrics: ragResponse.metrics,
    });
  } catch (error) {
    console.error("Python RAG service request failed:", error);
    return res
      .status(502)
      .json({ error: "The RAG service could not be reached." });
  }
});

app.listen(port, () =>
  console.log(`RAG API listening on http://localhost:${port}`),
);
