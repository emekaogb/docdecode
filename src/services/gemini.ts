import { GoogleGenAI, Type, Part } from "@google/genai";
import { DischargeAnalysis } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const analyzeDischargeNote = async (
  input: string | Part[], 
  isPremium: boolean = false,
  demographics?: { age: string; gender: string; location: string; latLng?: { latitude: number; longitude: number } }
): Promise<DischargeAnalysis> => {
  let prompt = `Analyze the following medical document (it could be a discharge note, an X-ray image, a lab chart, or a prescription) and explain it in layman's terms. 
    
    If it is a text document (like a discharge note):
    Break it down into logical topics (e.g., Diagnosis, Medications, Follow-up).
    
    If it is an image of an X-ray or medical scan:
    Explain what the image shows, any notable findings mentioned in the annotations or visible in the scan, and what they mean for the patient in simple terms.
    
    If it is a chart or lab result:
    Explain the key values, whether they are within normal range, and what the overall results indicate.
    
    For all types:
    Provide a clear, simple explanation for each section.`;

  if (isPremium && demographics) {
    prompt += `\n\nPREMIUM ANALYSIS:
    The patient is a ${demographics.age} year old ${demographics.gender} living in ${demographics.location}.
    Provide a deeper comparative analysis based on these demographics. Mention if certain findings are more common or concerning for this age group or location.
    Also, identify any follow-up appointments or medication reminders mentioned in the note and list them as structured reminders.
    Finally, suggest nearby healthcare facilities or specialists for follow-up based on the patient's location.`;
  }

  prompt += `\n\nOutput the result in the specified JSON format.`;

  const contents = typeof input === 'string' 
    ? { parts: [{ text: prompt }, { text: `Discharge Note:\n${input}` }] }
    : { parts: [{ text: prompt }, ...input] };

  const config: any = {
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
        demographicInsights: {
          type: Type.STRING,
          description: "Premium: Deeper analysis based on patient demographics.",
        },
        reminders: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              date: { type: Type.STRING, description: "ISO format date or descriptive time" },
              description: { type: Type.STRING }
            }
          }
        },
        nearbyFollowUp: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              address: { type: Type.STRING },
              uri: { type: Type.STRING }
            }
          }
        }
      },
      required: ["overallSummary", "slides"],
    },
  };

  if (isPremium && demographics?.latLng) {
    config.tools = [{ googleMaps: {} }];
    config.toolConfig = {
      retrievalConfig: {
        latLng: demographics.latLng
      }
    };
  }

  const response = await ai.models.generateContent({
    model: isPremium ? "gemini-2.5-flash" : "gemini-3-flash-preview",
    contents,
    config,
  });

  const result = JSON.parse(response.text || "{}");

  // If maps grounding was used, extract URIs
  if (isPremium && response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
    const chunks = response.candidates[0].groundingMetadata.groundingChunks;
    // The model might have already filled nearbyFollowUp, but we can enrich it if needed
    // For simplicity, we assume the model handles the tool output and populates the schema
  }

  return result;
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
