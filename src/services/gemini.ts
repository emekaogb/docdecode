import { GoogleGenAI, Type, Part } from "@google/genai";
import { DischargeAnalysis } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const analyzeDischargeNote = async (input: string | Part[]): Promise<DischargeAnalysis> => {
  const prompt = `Analyze the following medical discharge note and explain it in layman's terms. 
    Break it down into logical topics (e.g., Diagnosis, Medications, Follow-up, Activity Restrictions).
    For each topic, provide the original context and a clear, simple explanation.
    
    If you are provided with images or a PDF, perform OCR first to extract all text, then perform the analysis.
    
    Output the result in the specified JSON format.`;

  const contents = typeof input === 'string' 
    ? { parts: [{ text: prompt }, { text: `Discharge Note:\n${input}` }] }
    : { parts: [{ text: prompt }, ...input] };

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallSummary: {
            type: Type.STRING,
            description: "A high-level summary of the entire discharge note in 2-3 sentences.",
          },
          slides: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING, description: "The title of the topic (e.g., 'Your Diagnosis')." },
                content: { type: Type.STRING, description: "Detailed layman explanation of this specific topic." },
                laymanSummary: { type: Type.STRING, description: "A one-sentence 'bottom line' for this topic." },
              },
              required: ["topic", "content", "laymanSummary"],
            },
          },
        },
        required: ["overallSummary", "slides"],
      },
    },
  });

  return JSON.parse(response.text || "{}");
};

export const createChatSession = (context: DischargeAnalysis, originalNote: string) => {
  return ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: `You are a helpful medical assistant called DocDecode. 
      Your goal is to answer follow-up questions about a patient's discharge note.
      You have access to the original note and the simplified explanation provided to the user.
      Always use simple, empathetic language. Avoid jargon. If you must use a medical term, explain it.
      
      Original Note:
      ${originalNote}
      
      Simplified Explanation:
      ${JSON.stringify(context)}
      
      If the user asks something not covered in the note, advise them to contact their healthcare provider.`,
    },
  });
};
