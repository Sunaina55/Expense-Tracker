export default async (req) => {
  try {
    const { description } = await req.json();

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: 20,
        messages: [
          {
            role: "user",
            content: `Classify this expense description into exactly ONE of these categories: Food, Transport, Shopping, Health, Entertainment, Bills, Education, Other.
Reply with ONLY the category name, nothing else.

Description: "${description}"`,
          },
        ],
      }),
    });

    const data = await response.json();
    const category = data.choices?.[0]?.message?.content?.trim() || "Other";

    return new Response(JSON.stringify({ category }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ category: "Other" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
};