const express = require("express");
const fetch = require("node-fetch");
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Debug flag: true to use local Ollama, false to use Groq remote API
const DEBUG = false;

// Your Groq API key in env variable
const GROQ_API_KEY = "YOUR_GROQ_API_KEY";

const customPrompts = [
  {
    prompt: "What is Garibook?",
    response: "Garibook is a platform offering Car rental services in Bangladesh, connecting Car owners and renters."
  },
  {
    prompt: "Tell me about Car rental services",
    response: "Our Car rental service allows users to rent Car with flexible payment options and security features."
  },
  {
    prompt: "How does the chatbot work?",
    response: "Garibook chatbot uses AI to provide information and assistance related to Car rental services."
  }
];

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

  // Set headers for SSE (server-sent events)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  function sendWordByWord(content) {
    return new Promise(async (resolve) => {
      const words = content.split(" ");
      for (const word of words) {
        res.write(`data: ${JSON.stringify({ response: word + " " })}\n\n`);
        await new Promise(r => setTimeout(r, 40)); // small delay for streaming effect
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      resolve();
    });
  }

  // Check if prompt matches a custom predefined question
  const predefinedResponse = customPrompts.find(item =>
    normalizedPrompt.includes(item.prompt.toLowerCase())
  );

  if (predefinedResponse) {
    chatHistory.push({ role: "user", content: prompt });
    chatHistory.push({ role: "assistant", content: predefinedResponse.response });
    return sendWordByWord(predefinedResponse.response);
  }

  // Extract URL from prompt if any, fetch website content
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
    let aiMessage = "Sorry, no response.";

    if (DEBUG) {
      // Use local Ollama API
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
      aiMessage = ollamaResJson?.message?.content || aiMessage;

    } else {
      // Use Groq remote API
      if (!GROQ_API_KEY) {
        throw new Error("GROQ_API_KEY is not set in environment variables.");
      }

      const bodyPayload = {
        model: "llama-3.3-70b-versatile",
        messages: websiteContent
          ? [
            ...recentHistory,
            {
              role: "user",
              content: `Based on this website content: "${websiteContent.slice(0, 10000)}", answer the question: "${prompt}"`
            }
          ]
          : [
            ...recentHistory,
            {
              role: "user",
              content: prompt
            }
          ],
        stream: false
      };

      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
      });

      if (!groqRes.ok) {
        const errorText = await groqRes.text();
        console.error("Groq API error:", groqRes.status, errorText);
        throw new Error("Groq API returned an error");
      }

      const groqJson = await groqRes.json();
      console.log("Groq API response:", JSON.stringify(groqJson, null, 2));

      aiMessage = groqJson?.choices?.[0]?.message?.content || aiMessage;

    }

    chatHistory.push({ role: "assistant", content: aiMessage });

    return sendWordByWord(aiMessage);

  } catch (err) {
    console.error("AI API error:", err);
    res.write(`data: ${JSON.stringify({ response: "Failed to connect to AI API." })}\n\n`);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
