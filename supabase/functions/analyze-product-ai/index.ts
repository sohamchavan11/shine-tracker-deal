import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { product, priceHistory, reviews } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Calculate price statistics
    const prices = priceHistory.map((h: any) => h.price);
    const lowestPrice = Math.min(...prices);
    const highestPrice = Math.max(...prices);
    const avgPrice = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
    const currentPrice = product.current_price;
    
    // Calculate price position (0-100, where lower is better)
    const priceRange = highestPrice - lowestPrice;
    const pricePosition = priceRange > 0 ? ((currentPrice - lowestPrice) / priceRange) * 100 : 50;
    const worthBuyingScore = Math.round(100 - pricePosition);
    
    // Build context for AI
    const avgRating = reviews.length > 0 
      ? reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length 
      : 0;
    
    const positiveReviews = reviews.filter((r: any) => r.rating >= 4);
    const negativeReviews = reviews.filter((r: any) => r.rating < 4);
    
    const prompt = `Analyze this product and provide buying recommendations:

Product: ${product.name}
Current Price: ₹${currentPrice.toLocaleString('en-IN')}
Lowest Price (30 days): ₹${lowestPrice.toLocaleString('en-IN')}
Highest Price (30 days): ₹${highestPrice.toLocaleString('en-IN')}
Average Price: ₹${avgPrice.toFixed(2)}
Price Position: ${pricePosition.toFixed(1)}% from lowest to highest

Customer Reviews:
- Average Rating: ${avgRating.toFixed(1)}/5
- Positive Reviews: ${positiveReviews.length}
- Negative Reviews: ${negativeReviews.length}

Sample Positive Reviews:
${positiveReviews.slice(0, 3).map((r: any) => `- "${r.review_text}"`).join('\n')}

Sample Negative Reviews:
${negativeReviews.slice(0, 2).map((r: any) => `- "${r.review_text}"`).join('\n')}

Provide:
1. A concise 2-3 sentence summary of whether this is a good deal
2. A detailed recommendation paragraph (4-6 sentences) analyzing price trends, value, and customer sentiment

Be specific with actual numbers and prices. Focus on value and timing.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { 
            role: 'system', 
            content: 'You are a product analyst expert. Provide clear, data-driven buying recommendations.' 
          },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), 
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }), 
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error('AI analysis failed');
    }

    const data = await response.json();
    const analysisText = data.choices[0].message.content;
    
    // Parse the response to extract summary and detailed recommendation
    const lines = analysisText.split('\n').filter((line: string) => line.trim());
    let summary = '';
    let detailedRecommendation = '';
    
    let inSummary = false;
    let inDetailed = false;
    
    for (const line of lines) {
      if (line.includes('summary') || line.includes('Summary') || line.match(/^1\./)) {
        inSummary = true;
        inDetailed = false;
        continue;
      }
      if (line.includes('detailed') || line.includes('Detailed') || line.includes('recommendation') || line.match(/^2\./)) {
        inSummary = false;
        inDetailed = true;
        continue;
      }
      
      if (inSummary && line.trim()) {
        summary += line.trim() + ' ';
      }
      if (inDetailed && line.trim()) {
        detailedRecommendation += line.trim() + ' ';
      }
    }
    
    // Fallback if parsing fails
    if (!summary || !detailedRecommendation) {
      const parts = analysisText.split('\n\n');
      summary = parts[0] || analysisText.substring(0, 200);
      detailedRecommendation = parts[1] || analysisText.substring(200);
    }

    return new Response(
      JSON.stringify({ 
        worthBuyingScore,
        summary: summary.trim(),
        detailedRecommendation: detailedRecommendation.trim(),
        analysisText
      }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Analysis error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to analyze product' }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
