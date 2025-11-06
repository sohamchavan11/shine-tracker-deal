import { useState, useCallback, useRef } from 'react';
import { pipeline } from '@huggingface/transformers';

interface SentimentResult {
  label: string; // POSITIVE | NEUTRAL | NEGATIVE
  score: number; // confidence 0..1
}

// Map model-specific labels (e.g., "1 star".."5 stars") to generic ones
const mapLabel = (label: string = '', score: number): SentimentResult => {
  const l = label.toLowerCase();
  if (/(4|5)\s*star/.test(l) || l.includes('positive')) return { label: 'POSITIVE', score };
  if (/3\s*star/.test(l) || l.includes('neutral')) return { label: 'NEUTRAL', score };
  return { label: 'NEGATIVE', score };
};
export const useSentimentAnalyzer = () => {
  const [isLoading, setIsLoading] = useState(false);
  const pipelineRef = useRef<any>(null);

  const initializePipeline = async () => {
    if (pipelineRef.current) return pipelineRef.current;
    
    setIsLoading(true);
    try {
      // Use a stronger multilingual model with Neutral class for better quality
      const classifier = await pipeline(
        'sentiment-analysis',
        'Xenova/bert-base-multilingual-uncased-sentiment'
      );
      pipelineRef.current = classifier;
      return classifier;
    } finally {
      setIsLoading(false);
    }
  };

  const analyzeText = useCallback(async (text: string): Promise<SentimentResult> => {
    try {
      const classifier = await initializePipeline();
      const out = await classifier(text, { topk: 1 });
      const raw = Array.isArray(out) ? (Array.isArray(out[0]) ? out[0][0] : out[0]) : out;
      const mapped = mapLabel(raw?.label, raw?.score ?? 0.5);
      return mapped;
    } catch (error) {
      console.error('Sentiment analysis error:', error);
      throw error;
    }
  }, []);

  const analyzeBatch = useCallback(async (texts: string[]): Promise<SentimentResult[]> => {
    try {
      const classifier = await initializePipeline();
      const outs = await classifier(texts, { topk: 1 });
      // outs can be Array<Array<{label, score}>> depending on backend
      return outs.map((res: any) => {
        const raw = Array.isArray(res) ? res[0] : res;
        const mapped = mapLabel(raw?.label, raw?.score ?? 0.5);
        return mapped;
      });
    } catch (error) {
      console.error('Batch sentiment analysis error:', error);
      throw error;
    }
  }, []);

  return {
    analyzeText,
    analyzeBatch,
    isLoading
  };
};
