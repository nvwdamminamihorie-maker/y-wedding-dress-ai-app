
export type DressType = 'Aライン' | 'プリンセスライン' | 'マーメイドライン' | 'エンパイア' | 'スレンダーライン';
export type DiagnosisMode = 'wedding' | 'color';

export interface CollectionItem {
  id: string;
  title: string;
  type: DressType;
  category: DiagnosisMode;
  imageUrl: string | null;
  source: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  imageUrl?: string; // チャット内の添付画像
}

export interface IndividualDiagnosis {
  faceShape: string;
  skinTone: string;
  personalColor: string;
  atmosphereLabel: string;
}

export interface DiagnosisResult {
  recommendedDress: string;
  dressLine: DressType;
  bestMatchId: string;
  reason: string;
  analysisReasons: {
    facial: string;
    skin: string;
    atmosphere: string;
  };
  faceReading: string;
  preparationTasks: string;
  weddingAdvice: string;
  weddingScenario: string;
  partnerCompatibility?: string;
  partnerDiagnosis?: IndividualDiagnosis; // パートナー用の診断データ
  stylingDetails: {
    accessories: string;
    hairstyle: string;
    bouquet: string;
  };
  conciergeMessage: string;
  faceShape: string;
  skinTone: string;
  personalColor: string;
  atmosphereLabel: string;
}

export interface AppState {
  view: 'home' | 'catalog' | 'upload' | 'result' | 'chat_only';
  image: string | null;
  partnerImage: string | null;
  isCoupleMode: boolean;
  loading: boolean;
  result: DiagnosisResult | null;
  error: string | null;
  mode: DiagnosisMode | null;
  catalogItems: CollectionItem[];
  chatHistory: ChatMessage[];
  chatAttachedImage: string | null; // チャットで送信待ちの画像
}
