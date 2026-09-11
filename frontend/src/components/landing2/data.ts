/** Product facts for the landing page.
 *
 * Output types and parameters mirror backend/app/prompts.json exactly — if a
 * type or knob changes there, change it here. Nothing on this page is
 * invented: no metrics, no customer counts, no benchmark numbers. */

export const OUTPUTS = [
  { id: "video", label: "Video Package", blurb: "Script, storyboard, scene breakdown, narration and subtitle cues." },
  { id: "linkedin_post", label: "LinkedIn Post", blurb: "Professional long-form post with hook, structure and takeaways." },
  { id: "twitter_post", label: "X Post", blurb: "Serialised thread or single post with tight, quotable phrasing." },
  { id: "advisory", label: "Advisory", blurb: "Structured brief with findings, recommendations and context." },
  { id: "executive_summary", label: "Executive Summary", blurb: "Condensed synthesis with bottom-line implications." },
  { id: "presentation", label: "Presentation", blurb: "Slide-by-slide outline with talking points and Q&A prep." },
  { id: "infographic", label: "Infographic", blurb: "Visual hierarchy, metric callouts and designer handoff notes." },
] as const;

/** The six operator parameters, applied to every selected output. */
export const PARAMETERS = [
  { key: "target_audience", label: "Audience", example: "Executive, practitioner, general public" },
  { key: "tone", label: "Tone", example: "Neutral, formal, urgent, conversational" },
  { key: "language", label: "Language", example: "Any language you need" },
  { key: "level_of_detail", label: "Detail", example: "Brief, standard, comprehensive" },
  { key: "communication_objective", label: "Objective", example: "Inform, advise, warn, instruct" },
  { key: "content_style", label: "Style", example: "Factual, analytical, narrative, persuasive" },
] as const;

export const STEPS = [
  { n: "01", title: "Add your source", body: "Paste text, upload a PDF or document, drop in an image, or write a free-form prompt." },
  { n: "02", title: "Choose outputs", body: "Select one format or several. Every selected format is produced in the same run." },
  { n: "03", title: "Set parameters", body: "Audience, tone, language, detail, objective and style apply across all selections." },
  { n: "04", title: "Generate & export", body: "Watch each deliverable complete live, then edit or export what you need." },
] as const;

export const USE_CASES = [
  { from: "Research paper", to: "Executive summary + presentation", body: "Condense a long study into a board-ready briefing and a slide outline." },
  { from: "Announcement", to: "LinkedIn + X + infographic", body: "Turn a product or policy announcement into channel-ready social assets." },
  { from: "Threat intel", to: "Advisory + executive brief", body: "Convert an incident report into a structured advisory and a leadership summary." },
  { from: "Field report", to: "Video package", body: "Turn a market or field report into a script, storyboard and narration." },
] as const;
