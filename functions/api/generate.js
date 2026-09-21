const MODEL = "claude-sonnet-4-6";
const GUMROAD_VERIFY_URL = "https://api.gumroad.com/v2/licenses/verify";
const MAX_BACKGROUND = 8000;
const MAX_JOB = 10000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  return origin ? { "Access-Control-Allow-Origin": origin } : {};
}

function jsonWithCors(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request)
    }
  });
}

function cleanText(value, max) {
  return String(value || "").trim().slice(0, max);
}

async function verifyGumroadLicense(env, licenseKey) {
  const permalink = env.GUMROAD_PRODUCT_PERMALINK || "ojclf";
  const body = new URLSearchParams({
    product_permalink: permalink,
    license_key: licenseKey,
    increment_uses_count: "false"
  });

  const response = await fetch(GUMROAD_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const data = await response.json().catch(() => ({}));
  return Boolean(data.success && data.purchase && data.purchase.refunded !== true && data.purchase.chargebacked !== true);
}

function extractSections(text) {
  const raw = String(text || "");
  const resumePart = raw.split("===RESUME===")[1]?.split("===COVER LETTER===")[0]?.trim() || "";
  const coverPart = raw.split("===COVER LETTER===")[1]?.trim() || "";
  return { resume: resumePart || raw, cover: coverPart };
}

function makePreview(text, maxChars) {
  const value = String(text || "").trim();
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars).trimEnd() + "\n\n[Preview ends here — unlock to reveal the complete document.]";
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.ANTHROPIC_API_KEY) return jsonWithCors({ error: "Server is missing ANTHROPIC_API_KEY." }, 500, request);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: "Invalid request." }, 400, request);
  }

  const background = cleanText(body.background, MAX_BACKGROUND);
  const job = cleanText(body.job, MAX_JOB);
  const tone = ["professional", "warm", "executive"].includes(body.tone) ? body.tone : "professional";
  const length = ["concise", "detailed"].includes(body.length) ? body.length : "concise";
  const licensed = body.licensed === true;
  const licenseKey = cleanText(body.licenseKey, 128);

  if (!background || !job) return jsonWithCors({ error: "Background and target job are required." }, 400, request);

  if (licensed) {
    if (!licenseKey) return jsonWithCors({ error: "Enter the license key from your Gumroad receipt." }, 400, request);
    let valid = false;
    try {
      valid = await verifyGumroadLicense(env, licenseKey);
    } catch (error) {
      console.error("Gumroad verification failed", error);
      return jsonWithCors({ error: "Gumroad could not be reached. Please try again." }, 502, request);
    }
    if (!valid) return jsonWithCors({ error: "That license key could not be verified for this ResumeBoost product." }, 403, request);
  }

  const toneGuide = {
    professional: "clear, confident, and neutral in register",
    warm: "personable and warm while staying credible — like a capable colleague, not stiff corporate-speak",
    executive: "assured and high-level, emphasizing scope, impact, and leadership"
  }[tone];
  const lengthGuide = {
    concise: "Keep the resume to about one page of content and the cover letter to 3 short paragraphs.",
    detailed: "The resume can run to a fuller page and a half if the background supports it, and the cover letter can run to 4–5 paragraphs."
  }[length];

  const prompt = `You are an expert resume writer and former recruiter. Given a candidate's background and a target job, produce a tailored resume and cover letter.

Tone: ${toneGuide}.
Length: ${lengthGuide}

Requirements:
- Silently identify the 8–12 most important keywords, skills, and qualifications from the target job description.
- Work as many of those keywords as truthfully fit into the resume's Skills and Experience sections, without inventing experience the candidate didn't mention.
- Never invent employers, job titles, dates, qualifications, licences, certifications, software, metrics, responsibilities, or achievements.
- Rewrite vague background notes into concrete, achievement-oriented language. Where the candidate gave numbers, keep them. Where they didn't, do not invent metrics.
- Use short markdown-style headings on their own line starting with "## " for each resume section.
- The cover letter should open with something specific to the role or company inferred from the job text rather than a generic opener, and should not repeat the resume word-for-word.
- Plain text only: no asterisks, no bold markers, and no bullet character other than "- " at the start of a line.
- Do not add placeholders such as [Company Name] unless the listing itself lacks the information and the placeholder is truly necessary.

Candidate background:
"""${background}"""

Target job:
"""${job}"""

Respond ONLY in this exact format, with no extra commentary:
===RESUME===
<resume text>
===COVER LETTER===
<cover letter text>`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: length === "detailed" ? 2200 : 1700,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error("Anthropic error", response.status, data);
  return jsonWithCors({ error: data?.error?.message || JSON.stringify(data) }, 502, request);
}

  const text = (data.content || []).map(b => b.text || "").join("\n");
  const docs = extractSections(text);

  if (licensed) {
    return jsonWithCors({ unlocked: true, resume: docs.resume, cover: docs.cover }, 200, request);
  }

  return jsonWithCors({
    unlocked: false,
    resume: makePreview(docs.resume, 1250),
    cover: makePreview(docs.cover, 850)
  }, 200, request);
}
