const express = require("express");
const fetch = require("node-fetch");
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Custom predefined responses
const customPrompts = [
  {
    prompt: "What is Garibook?",
    response: "Garibook is a platform offering Car rental services in Bangladesh, connecting homeowners and renters."
  },
  {
    prompt: "Tell me about home rental services",
    response: "Our home rental service allows users to rent Car with flexible payment options and security features."
  },
  {
    prompt: "How does the chatbot work?",
    response: "Garibook chatbot uses AI to provide information and assistance related to Car rental services."
  }
];

// Simple in-memory chat history
let chatHistory = [];

function isValidURL(str) {
  try {
    new URL(str);
    return true;
  } catch (_) {
    return false;
  }
}

app.post("/api/chat", async (req, res) => {
  const prompt = req.body.prompt || "";
  const normalizedPrompt = prompt.toLowerCase().trim();

  // Set response headers for EventStream
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  function sendWordByWord(content) {
    return new Promise(async (resolve) => {
      const words = content.split(" ");
      for (const word of words) {
        res.write(`data: ${JSON.stringify({ response: word + " " })}\n\n`);
        await new Promise(r => setTimeout(r, 40));
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      resolve();
    });
  }

  // Check for custom prompt
  const predefinedResponse = customPrompts.find(item =>
    normalizedPrompt.includes(item.prompt.toLowerCase())
  );

  if (predefinedResponse) {
    chatHistory.push({ role: "user", content: prompt });
    chatHistory.push({ role: "assistant", content: predefinedResponse.response });
    return sendWordByWord(predefinedResponse.response);
  }

  // Check for URL in prompt
  const urlRegex = /(https?:\/\/[^\s]+)/;
  const match = prompt.match(urlRegex);
  let websiteContent = "";

  if (match && isValidURL(match[0])) {
    try {
      const htmlRes = await fetch(match[0]);
      websiteContent = await htmlRes.text();
    } catch (err) {
      res.write(`data: ${JSON.stringify({ response: "Error fetching website content." })}\n\n`);
      res.end();
      return;
    }
  }

  chatHistory.push({ role: "user", content: prompt });
  const recentHistory = chatHistory.slice(-10);

  try {
    const ollamaRes = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        messages: websiteContent
          ? [
              ...recentHistory,
              {
                role: "user",
                content: `Based on this website content: "${websiteContent.slice(0, 10000)}", answer the question: "${prompt}"`
              }
            ]
          : recentHistory,
        stream: false
      })
    });

    const ollamaResJson = await ollamaRes.json();
    const aiMessage = ollamaResJson?.message?.content || "Sorry, no response.";
    chatHistory.push({ role: "assistant", content: aiMessage });

    return sendWordByWord(aiMessage);
  } catch (err) {
    console.error("Ollama error:", err);
    res.write(`data: ${JSON.stringify({ response: "Failed to connect to Ollama." })}\n\n`);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
