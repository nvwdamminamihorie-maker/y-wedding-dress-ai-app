
import { GoogleGenAI, Type } from "@google/genai";
import { DiagnosisResult, DiagnosisMode, CollectionItem, ChatMessage } from "./types";

// Always use named parameter for apiKey and obtain it from process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// ウェディングドレス診断の実行
export const analyzeWeddingDress = async (
  userBase64Image: string, 
  mode: DiagnosisMode, 
  catalogItems: CollectionItem[],
  partnerBase64Image?: string | null
): Promise<DiagnosisResult> => {
  // Use gemini-2.5-flash for fast and high-quality image analysis and diagnosis
  const modelName = 'gemini-2.5-flash';
  
  const parts: any[] = [
    { text: "USER_PHOTO (Main User/Bride):" },
    { inlineData: { mimeType: 'image/jpeg', data: userBase64Image.split(',')[1] } }
  ];

  if (partnerBase64Image) {
    parts.push({ text: "PARTNER_PHOTO (Groom/Partner):" });
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: partnerBase64Image.split(',')[1] } });
  }

  const catalogParts = catalogItems.map((item) => ([
    { text: `DRESS_ID: ${item.id}` },
    { inlineData: { mimeType: 'image/jpeg', data: item.imageUrl!.split(',')[1] } }
  ])).flat();

  parts.push({ text: `AVAILABLE_DRESS_CATALOG:` }, ...catalogParts);

  parts.push({
    text: `あなたは兵庫県神戸市で非常に人気があり、Googleの口コミでも最高評価を得ているドレスショップ「New Vintage Wedding」の専属コンシェルジュです。
ユーザー（新婦）とパートナー（新郎）のお写真を分析し、診断を行ってください。

【診断の重要ルール】
1. ユーザー（新婦）の「パーソナルカラー」および「顔型」を特定。
2. パートナーがいる場合は、パートナーの「顔型」や「パーソナルカラー」も特定。
3. 【顔相・相性・準備マインドセット診断】
   - おふたりの顔型から読み取れる性格傾向（例：丸顔は協調性、面長は思慮深さ、角顔は実行力等）を人相学の観点から分析。
   - 結婚準備を円滑に進めるための「ふたりの考え方の補完関係」や「スムーズに進むマインドセット」、また「お互いへの適切な配慮の仕方」をアドバイスしてください。
   - おふたりのカラーの調和についても触れてください。
4. 神戸の洗練されたスタイルと、当店の高いホスピタリティを感じさせる温かい言葉を添えてください。

【出力項目 (JSON)】
- recommendedDress: キャッチコピー
- dressLine: 形
- bestMatchId: ID
- reason: 選定理由
- faceReading: 顔相から見るおふたりの性格的特徴と魅力（補完関係）
- faceShape: 新婦の顔型
- personalColor: 新婦のパーソナルカラー
- partnerCompatibility: おふたりの相性とカラーの調和（詳細に）
- weddingAdvice: 準備を円滑に進めるための考え方と相手への配慮（顔相診断に基づく）
- partnerDiagnosis: { faceShape, skinTone, personalColor, atmosphereLabel } (パートナーがいる場合のみ)
- conciergeMessage: おふたりへのエール
- stylingDetails: (accessories, hairstyle, bouquet)`
  });

  const response = await ai.models.generateContent({
    model: modelName,
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          recommendedDress: { type: Type.STRING },
          dressLine: { type: Type.STRING },
          bestMatchId: { type: Type.STRING },
          reason: { type: Type.STRING },
          analysisReasons: {
            type: Type.OBJECT,
            properties: { facial: { type: Type.STRING }, skin: { type: Type.STRING }, atmosphere: { type: Type.STRING } },
            required: ["facial", "skin", "atmosphere"]
          },
          faceReading: { type: Type.STRING },
          faceShape: { type: Type.STRING },
          personalColor: { type: Type.STRING },
          atmosphereLabel: { type: Type.STRING },
          partnerCompatibility: { type: Type.STRING },
          weddingAdvice: { type: Type.STRING },
          partnerDiagnosis: {
            type: Type.OBJECT,
            properties: {
              faceShape: { type: Type.STRING },
              skinTone: { type: Type.STRING },
              personalColor: { type: Type.STRING },
              atmosphereLabel: { type: Type.STRING }
            },
            required: ["faceShape", "skinTone", "personalColor", "atmosphereLabel"]
          },
          stylingDetails: {
            type: Type.OBJECT,
            properties: { accessories: { type: Type.STRING }, hairstyle: { type: Type.STRING }, bouquet: { type: Type.STRING } },
            required: ["accessories", "hairstyle", "bouquet"]
          },
          conciergeMessage: { type: Type.STRING },
          preparationTasks: { type: Type.STRING },
          weddingScenario: { type: Type.STRING }
        },
        required: ["recommendedDress", "dressLine", "bestMatchId", "reason", "analysisReasons", "faceReading", "faceShape", "personalColor", "atmosphereLabel", "weddingAdvice", "stylingDetails", "conciergeMessage"]
      }
    }
  });

  // response.text is a getter, do not call as a method
  return JSON.parse(response.text || '{}') as DiagnosisResult;
};

export const chatWithConcierge = async (history: ChatMessage[], message: string, imageBase64?: string | null): Promise<string> => {
  // Use gemini-2.5-flash for high-speed, conversational AI interactions
  const modelName = 'gemini-2.5-flash';

  const systemInstruction = `あなたは兵庫県神戸市でGoogle口コミ高評価を誇る人気ドレスショップ「New Vintage Wedding」の専属コンシェルジュです。
【ショップ背景】神戸の洗練された街並みに溶け込む、ヴィンテージとモダンが融合したスタイルを提案しています。
【性格】優しく、親しみやすく、お客様の心に寄り添う柔らかい口調。
【対話ルール】
1. 回答は簡潔に。
2. 最後は質問で終わること。
3. ドレス選びや結婚準備におけるパートナーシップ、顔相に基づいた性格的な傾向などの相談にも乗ってください。
4. 適宜、神戸の店舗でお会いできることを楽しみにしているような、温かい接客を心がけてください。`;

  const contents = [
    ...history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model' as 'user' | 'model',
      parts: [
        { text: h.text },
        ...(h.imageUrl ? [{ inlineData: { mimeType: 'image/jpeg', data: h.imageUrl.split(',')[1] } }] : [])
      ]
    })),
    {
      role: 'user' as const,
      parts: [
        { text: message },
        ...(imageBase64 ? [{ inlineData: { mimeType: 'image/jpeg', data: imageBase64.split(',')[1] } }] : [])
      ]
    }
  ];

  const response = await ai.models.generateContent({
    model: modelName,
    contents,
    config: { systemInstruction }
  });

  // response.text is a getter
  return response.text || '';
};
