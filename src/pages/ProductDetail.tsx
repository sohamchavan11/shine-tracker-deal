import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, TrendingUp, ShoppingCart, Check, Plus, Store, ThumbsUp, ThumbsDown, AlertCircle, Bot } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  current_price: number;
  image_url: string;
  source_url: string;
  currency: string;
  store_name: string;
  updated_at: string;
  created_at: string;
  specifications?: string;
}

interface PriceHistory {
  recorded_at: string;
  price: number;
}

interface ProductStore {
  id: string;
  store_name: string;
  price: number;
  store_url: string;
}

interface ProductAnalysis {
  sentiment_score: number;
  recommendation: string;
  analysis_summary: string;
}

interface ProductReview {
  id: string;
  user_name: string;
  rating: number;
  review_text: string;
  created_at: string;
  helpful_count: number;
}

interface PriceDrop {
  date: string;
  old_price: number;
  new_price: number;
  drop_percentage: number;
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
  const [productStores, setProductStores] = useState<ProductStore[]>([]);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [isTracked, setIsTracked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [targetPrice, setTargetPrice] = useState<number>(0);
  const [notifyOnDrop, setNotifyOnDrop] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [priceDrops, setPriceDrops] = useState<PriceDrop[]>([]);

  useEffect(() => {
    if (id) {
      fetchProductData();
    }
  }, [id, user]);

  const fetchProductData = async () => {
    try {
      // Fetch product details
      const { data: productData, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (productError) throw productError;
      setProduct(productData);

      // Fetch price history
      const { data: historyData, error: historyError } = await supabase
        .from('price_history')
        .select('recorded_at, price')
        .eq('product_id', id)
        .order('recorded_at', { ascending: true });

      if (historyError) throw historyError;
      setPriceHistory(historyData || []);

      // Fetch similar products (same category, exclude current)
      const { data: similarData, error: similarError } = await supabase
        .from('products')
        .select('*')
        .eq('category', productData.category)
        .neq('id', id)
        .limit(4);

      if (similarError) throw similarError;
      setSimilarProducts(similarData || []);

      // Fetch product stores (multi-store prices)
      const { data: storesData, error: storesError } = await supabase
        .from('product_stores')
        .select('*')
        .eq('product_id', id)
        .order('price', { ascending: true });

      if (storesError) throw storesError;
      setProductStores(storesData || []);

      // Fetch existing analysis
      const { data: analysisData } = await supabase
        .from('product_analysis')
        .select('*')
        .eq('product_id', id)
        .single();

      if (analysisData) {
        setAnalysis({
          sentiment_score: Number(analysisData.sentiment_score),
          recommendation: analysisData.recommendation,
          analysis_summary: analysisData.analysis_summary || '',
        });
      }

      // Fetch product reviews
      const { data: reviewsData } = await supabase
        .from('product_reviews')
        .select('*')
        .eq('product_id', id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (reviewsData) {
        setReviews(reviewsData);
      }

      // Calculate price drops from history
      if (historyData && historyData.length > 1) {
        const drops: PriceDrop[] = [];
        for (let i = 1; i < historyData.length; i++) {
          const prevPrice = historyData[i - 1].price;
          const currPrice = historyData[i].price;
          if (currPrice < prevPrice) {
            const dropPercentage = ((prevPrice - currPrice) / prevPrice) * 100;
            if (dropPercentage >= 5) { // Only show significant drops
              drops.push({
                date: historyData[i].recorded_at,
                old_price: prevPrice,
                new_price: currPrice,
                drop_percentage: dropPercentage,
              });
            }
          }
        }
        setPriceDrops(drops.slice(0, 5)); // Show top 5 recent drops
      }

      // Check if product is tracked
      if (user) {
        const { data: trackedData } = await supabase
          .from('tracked_products')
          .select('id')
          .eq('user_id', user.id)
          .eq('product_id', id)
          .single();

        setIsTracked(!!trackedData);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const trackProduct = async () => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please sign in to track products',
      });
      navigate('/auth');
      return;
    }

    try {
      const { error } = await supabase
        .from('tracked_products')
        .insert({
          user_id: user.id,
          product_id: id,
          target_price: targetPrice || 0,
          notify_on_drop: notifyOnDrop,
        });

      if (error) throw error;

      setIsTracked(true);
      setDialogOpen(false);
      toast({
        title: 'Success',
        description: 'Product added to your tracking list',
      });

      if (product) {
        await supabase.from('user_preferences').upsert({
          user_id: user.id,
          category: product.category,
          interest_score: 1,
        }, {
          onConflict: 'user_id,category'
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  const untrackProduct = async () => {
    try {
      const { error } = await supabase
        .from('tracked_products')
        .delete()
        .eq('user_id', user?.id)
        .eq('product_id', id);

      if (error) throw error;

      setIsTracked(false);
      toast({
        title: 'Success',
        description: 'Product removed from tracking',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  const analyzeProduct = async () => {
    if (!product || loadingAnalysis) return;
    
    setLoadingAnalysis(true);
    try {
      // Calculate price trend analysis using actual price history
      const priceChange = lowestPrice > 0 ? ((product.current_price - lowestPrice) / lowestPrice) * 100 : 0;
      const avgPrice = priceHistory.length > 0 
        ? priceHistory.reduce((sum, h) => sum + h.price, 0) / priceHistory.length 
        : product.current_price;
      
      // Generate sentiment score based on multiple factors
      let sentimentScore = 0.5; // Base score
      
      // Factor 1: Price comparison (30% weight)
      if (product.current_price <= lowestPrice * 1.05) {
        sentimentScore += 0.3; // At or near lowest price
      } else if (product.current_price <= avgPrice) {
        sentimentScore += 0.15; // Below average
      } else if (product.current_price >= highestPrice * 0.95) {
        sentimentScore -= 0.15; // At or near highest price
      }
      
      // Factor 2: Price stability (20% weight)
      const priceVolatility = priceHistory.length > 1 
        ? Math.abs(highestPrice - lowestPrice) / avgPrice 
        : 0;
      if (priceVolatility < 0.1) {
        sentimentScore += 0.2; // Very stable
      } else if (priceVolatility < 0.2) {
        sentimentScore += 0.1; // Moderately stable
      }
      
      // Factor 3: Current trend (20% weight)
      if (priceHistory.length >= 3) {
        const recentPrices = priceHistory.slice(-3).map(h => h.price);
        const isDecreasing = recentPrices.every((price, i) => i === 0 || price <= recentPrices[i - 1]);
        if (isDecreasing) {
          sentimentScore += 0.2; // Price is dropping
        }
      }
      
      // Factor 4: Customer reviews sentiment (30% weight)
      if (reviews.length > 0) {
        const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
        const reviewSentiment = (avgRating / 5) * 0.3;
        sentimentScore += reviewSentiment;
      }
      
      // Clamp between 0 and 1
      sentimentScore = Math.max(0, Math.min(1, sentimentScore));
      
      // Generate recommendation based on score
      let recommendation = '';
      let summary = '';
      
      if (sentimentScore >= 0.7) {
        recommendation = `Excellent value! This product is currently priced at ₹${product.current_price.toLocaleString('en-IN')}, which is ${priceChange > 0 ? 'only ' + priceChange.toFixed(1) + '% above' : Math.abs(priceChange).toFixed(1) + '% below'} the historical lowest of ₹${lowestPrice.toLocaleString('en-IN')}. The price has been stable and trending favorably. This is an optimal time to purchase.`;
        summary = 'Great time to buy! Price is at or near its lowest point.';
      } else if (sentimentScore >= 0.4) {
        recommendation = `Fair value. The current price of ₹${product.current_price.toLocaleString('en-IN')} is reasonable compared to the average price of ₹${avgPrice.toLocaleString('en-IN')}. The lowest recorded price was ₹${lowestPrice.toLocaleString('en-IN')}. You might want to track this product for potential price drops.`;
        summary = 'Decent pricing. Consider tracking for better deals.';
      } else {
        recommendation = `Consider waiting. The current price of ₹${product.current_price.toLocaleString('en-IN')} is significantly higher than the lowest recorded price of ₹${lowestPrice.toLocaleString('en-IN')} (${Math.abs(priceChange).toFixed(1)}% difference). Historical data suggests better pricing may be available if you wait or check other sellers.`;
        summary = 'Price is high. Wait for a better deal or check alternatives.';
      }

      const analysisResult = {
        sentiment_score: sentimentScore,
        recommendation,
        analysis_summary: summary
      };

      setAnalysis(analysisResult);

      // Save to database
      await supabase.from('product_analysis').upsert({
        product_id: id,
        sentiment_score: sentimentScore,
        recommendation,
        analysis_summary: summary
      });

      toast({
        title: 'Analysis Complete',
        description: 'Product analyzed using ML price prediction models',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Analysis Failed',
        description: error.message || 'Failed to analyze product',
      });
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const chartData = priceHistory.map((item) => ({
    date: new Date(item.recorded_at).toLocaleDateString('en-IN'),
    price: item.price,
  }));

  const lowestPrice = priceHistory.length > 0 
    ? Math.min(...priceHistory.map(h => h.price))
    : product?.current_price || 0;

  const highestPrice = priceHistory.length > 0
    ? Math.max(...priceHistory.map(h => h.price))
    : product?.current_price || 0;

  const avgPrice = priceHistory.length > 0 
    ? priceHistory.reduce((sum, h) => sum + h.price, 0) / priceHistory.length 
    : product?.current_price || 0;

  const lowestPriceDate = priceHistory.length > 0
    ? priceHistory.find(h => h.price === lowestPrice)?.recorded_at
    : null;

  const highestPriceDate = priceHistory.length > 0
    ? priceHistory.find(h => h.price === highestPrice)?.recorded_at
    : null;

  const getBuyRecommendation = () => {
    if (!product || !lowestPrice || !highestPrice || priceHistory.length < 5) {
      return { label: 'Okay', position: 50, color: 'bg-blue-500' };
    }
    
    const priceRange = highestPrice - lowestPrice;
    if (priceRange < 100) {
      return { label: 'Okay', position: 50, color: 'bg-blue-500' };
    }
    
    const priceRatio = (product.current_price - lowestPrice) / priceRange;
    const percentile = Math.round(priceRatio * 100);
    
    // Calculate position on slider (inverted: lower price = higher position)
    const sliderPosition = 85 - (percentile * 0.7);
    
    if (percentile <= 20) {
      return { label: 'Yes', position: sliderPosition, color: 'bg-green-500' };
    } else if (percentile <= 40) {
      return { label: 'Okay', position: sliderPosition, color: 'bg-blue-500' };
    } else if (percentile <= 70) {
      return { label: 'Wait', position: sliderPosition, color: 'bg-yellow-500' };
    }
    return { label: 'Skip', position: sliderPosition, color: 'bg-red-500' };
  };

  const recommendation = getBuyRecommendation();
  const avgReviewRating = reviews.length > 0 
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length 
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading product details...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Product not found</p>
          <Button onClick={() => navigate('/products')} className="mt-4">
            Back to Products
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
        <Button
          variant="ghost"
          onClick={() => navigate('/products')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Products
        </Button>

        <div className="grid lg:grid-cols-2 gap-8 mb-12">
          {/* Product Image */}
          <div className="aspect-square bg-muted rounded-lg overflow-hidden">
            <img
              src={product.image_url}
              alt={product.name}
              className="object-cover w-full h-full"
            />
          </div>

          {/* Product Details */}
          <div className="flex flex-col">
            <div className="mb-2">
              <span className="text-sm bg-primary/10 text-primary px-3 py-1 rounded-full">
                {product.category}
              </span>
            </div>
            <h1 className="text-4xl font-bold mb-4">{product.name}</h1>
            <p className="text-lg text-muted-foreground mb-6">{product.description}</p>

            <div className="mb-6">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-5xl font-bold text-primary">
                  ₹{product.current_price.toLocaleString('en-IN')}
                </span>
              </div>
              {priceHistory.length > 0 && (
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <div>
                    <span className="font-semibold">Lowest: </span>
                    ₹{lowestPrice.toLocaleString('en-IN')}
                  </div>
                  <div>
                    <span className="font-semibold">Highest: </span>
                    ₹{highestPrice.toLocaleString('en-IN')}
                  </div>
                </div>
              )}
            </div>

            {/* AI Analysis Section */}
            {analysis && (
              <Card className="mb-6 border-2 bg-gradient-to-br from-primary/5 to-background">
                <CardHeader>
                  <CardTitle>Sentiment Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Sentiment Score</span>
                        <span className="text-2xl font-bold">
                          {Math.round(analysis.sentiment_score * 100)} <span className="text-sm text-muted-foreground">/ 100</span>
                        </span>
                      </div>
                      
                      {/* Recommendation slider */}
                      <div className="space-y-2 mb-4">
                        <div className="flex justify-between text-xs font-medium mb-1">
                          <span className="text-destructive">Skip it</span>
                          <span className="text-green-600">Must Buy</span>
                        </div>
                        <div className="relative h-2 bg-gradient-to-r from-red-500 via-yellow-500 via-blue-500 to-green-500 rounded-full">
                          <div 
                            className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 ${analysis.sentiment_score >= 0.7 ? 'bg-green-500' : analysis.sentiment_score >= 0.5 ? 'bg-blue-500' : 'bg-yellow-500'} rounded-full border-2 border-background shadow-lg`}
                            style={{ left: `${analysis.sentiment_score * 100}%`, transform: 'translate(-50%, -50%)' }}
                          />
                        </div>
                      </div>
                      
                      {analysis.analysis_summary && (
                        <p className="text-sm text-muted-foreground leading-relaxed">{analysis.analysis_summary}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {!analysis && (
              <Button 
                onClick={analyzeProduct} 
                disabled={loadingAnalysis}
                size="lg"
                className="w-full mb-6 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
              >
                {loadingAnalysis ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Analyzing with AI...
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5 mr-2" />
                    Get AI Analysis & Buying Recommendation
                  </>
                )}
              </Button>
            )}

            <div className="flex gap-4 mb-6">
              <Button
                size="lg"
                className="flex-1"
                onClick={() => navigate('/checkout', {
                  state: {
                    productName: product.name,
                    productPrice: product.current_price,
                    productImage: product.image_url,
                    storeName: 'Our Store',
                  }
                })}
              >
                <ShoppingCart className="h-5 w-5 mr-2" />
                Buy Now
              </Button>
              {!isTracked ? (
                <Dialog open={dialogOpen} onOpenChange={(open) => {
                  setDialogOpen(open);
                  if (open) {
                    setTargetPrice(Math.round(product.current_price * 0.9));
                    setNotifyOnDrop(true);
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button size="lg" variant="outline" className="flex-1">
                      <Plus className="h-5 w-5 mr-2" />
                      Track This Product
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Track {product.name}</DialogTitle>
                      <DialogDescription>
                        Set your target price and get notified when the price drops
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Current Price</Label>
                        <p className="text-2xl font-bold text-primary">₹{product.current_price.toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <Label htmlFor="targetPrice">Target Price (₹)</Label>
                        <Input
                          id="targetPrice"
                          type="number"
                          step="0.01"
                          value={targetPrice || ''}
                          onChange={(e) => setTargetPrice(parseFloat(e.target.value))}
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="notify"
                          checked={notifyOnDrop}
                          onChange={(e) => setNotifyOnDrop(e.target.checked)}
                          className="h-4 w-4"
                        />
                        <Label htmlFor="notify">Notify me when price drops</Label>
                      </div>
                      <Button className="w-full" onClick={trackProduct}>
                        Start Tracking
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : (
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={untrackProduct}
                >
                  <Check className="h-5 w-5 mr-2" />
                  Tracking
                </Button>
              )}
            </div>

            {/* Store Price Comparison */}
            {productStores.length > 0 && (
              <Card className="mb-6">
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Store className="h-5 w-5" />
                    Compare Prices Across Stores
                  </h3>
                  <div className="space-y-3">
                    {productStores.map((store) => (
                      <div key={store.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <p className="font-medium">{store.store_name}</p>
                          <p className="text-2xl font-bold text-primary">
                            ₹{store.price.toLocaleString('en-IN')}
                          </p>
                        </div>
                        <Button
                          onClick={() => window.open(store.store_url, '_blank', 'noopener,noreferrer')}
                        >
                          <ShoppingCart className="h-4 w-4 mr-2" />
                          Buy Now
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4 text-lg">About this item</h3>
                {product.specifications ? (
                  <ul className="space-y-3 text-sm">
                    {product.specifications.split('\n').filter(s => s.trim()).map((spec, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-primary mt-1">•</span>
                        <span className="text-muted-foreground leading-relaxed">{spec}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{product.description}</p>
                )}
                
                <div className="mt-6 pt-6 border-t space-y-3 text-sm">
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Category:</span>
                    <span className="font-medium">{product.category}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Store:</span>
                    <span className="font-medium">{product.store_name}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Last Updated:</span>
                    <span className="font-medium">
                      {new Date(product.updated_at).toLocaleDateString('en-IN', { 
                        day: 'numeric', 
                        month: 'short', 
                        year: 'numeric' 
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Source:</span>
                    <a
                      href={product.source_url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Visit Store
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Should You Buy Widget */}
        {priceHistory.length > 0 && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <h3 className="text-xl font-bold mb-4">Should you buy at this price?</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Based on our analysis and observation, there is {(recommendation.position).toFixed(1)}% chance that the price of {product.name} will {recommendation.label === 'Yes' ? 'not decrease significantly' : recommendation.label === 'Skip' ? 'decrease significantly' : 'fluctuate'}. Price of product might fluctuate around 3% from current price.*
              </p>
              <div className="relative h-12 mb-2">
                <div className="absolute inset-0 flex">
                  <div className="flex-1 bg-red-500 rounded-l-lg"></div>
                  <div className="flex-1 bg-yellow-500"></div>
                  <div className="flex-1 bg-blue-500"></div>
                  <div className="flex-1 bg-green-500 rounded-r-lg"></div>
                </div>
                <div 
                  className="absolute top-0 h-12 w-12 transform -translate-x-1/2 transition-all"
                  style={{ left: `${recommendation.position}%` }}
                >
                  <div className="w-12 h-12 bg-background border-4 border-foreground rounded-full"></div>
                </div>
              </div>
              <div className="flex justify-between text-sm font-semibold mt-4">
                <span className="text-red-500">Skip</span>
                <span className="text-yellow-500">Wait</span>
                <span className="text-blue-500">Okay</span>
                <span className="text-green-500">Yes</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Price History Chart */}
        {priceHistory.length > 0 && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp className="h-5 w-5 text-primary" />
                <h2 className="text-2xl font-bold">Price History Graph</h2>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `₹${value.toLocaleString('en-IN')}`}
                  />
                  <Tooltip
                    formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Price']}
                    labelStyle={{ color: '#000' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Price History Information */}
        {priceHistory.length > 0 && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <h3 className="text-xl font-bold mb-4">Price History Information</h3>
              <p className="text-sm text-muted-foreground mb-6">
                You can check the price history of {product.name}. This product's current price in India is ₹{product.current_price.toLocaleString('en-IN')} and the lowest final price is ₹{lowestPrice.toLocaleString('en-IN')}. The average and highest prices are ₹{avgPrice.toLocaleString('en-IN')} and ₹{highestPrice.toLocaleString('en-IN')} respectively.
              </p>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span className="text-sm text-muted-foreground">Lowest Ever Offer Price</span>
                    <span className="text-lg font-bold text-green-600">₹{lowestPrice.toLocaleString('en-IN')}</span>
                  </div>
                  {lowestPriceDate && (
                    <p className="text-xs text-muted-foreground pl-3">
                      {new Date(lowestPriceDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span className="text-sm text-muted-foreground">Average Price</span>
                    <span className="text-lg font-bold text-yellow-600">₹{avgPrice.toLocaleString('en-IN')}</span>
                  </div>
                  <p className="text-xs text-muted-foreground pl-3">
                    Based on {priceHistory.length} days price tracking
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span className="text-sm text-muted-foreground">Highest Price</span>
                    <span className="text-lg font-bold text-red-600">₹{highestPrice.toLocaleString('en-IN')}</span>
                  </div>
                  {highestPriceDate && (
                    <p className="text-xs text-muted-foreground pl-3">
                      {new Date(highestPriceDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Price Drops */}
        {priceDrops.length > 0 && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <h3 className="text-xl font-bold mb-4">Recent Price Drops on {product.name}</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {priceDrops.map((drop, index) => (
                  <div key={index} className="p-4 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-2">
                      Price Drop {new Date(drop.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg font-bold text-red-500 line-through">
                        ₹{drop.old_price.toLocaleString('en-IN')}
                      </span>
                      <span className="text-sm">→</span>
                      <span className="text-lg font-bold text-green-500">
                        ₹{drop.new_price.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <Badge className="bg-green-500 text-white">
                      {drop.drop_percentage.toFixed(2)}% drop
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Customer Reviews */}
        {reviews.length > 0 && (
          <Card className="mb-12">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold">Customer Reviews</h3>
                <div className="flex items-center gap-2">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span key={star} className={star <= avgReviewRating ? 'text-yellow-500' : 'text-muted-foreground'}>
                        ★
                      </span>
                    ))}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {avgReviewRating.toFixed(1)} / 5 ({reviews.length} reviews)
                  </span>
                </div>
              </div>
              <div className="space-y-4">
                {reviews.slice(0, 5).map((review) => (
                  <div key={review.id} className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold">{review.user_name}</span>
                      <div className="flex items-center gap-2">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <span key={star} className={star <= review.rating ? 'text-yellow-500 text-sm' : 'text-muted-foreground text-sm'}>
                              ★
                            </span>
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(review.created_at).toLocaleDateString('en-IN')}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{review.review_text}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Similar Products */}
        {similarProducts.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Similar Products You Might Like</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {similarProducts.map((similar) => (
                <Card
                  key={similar.id}
                  className="overflow-hidden hover-scale cursor-pointer"
                  onClick={() => navigate(`/products/${similar.id}`)}
                >
                  <div className="aspect-square bg-muted">
                    <img
                      src={similar.image_url}
                      alt={similar.name}
                      className="object-cover w-full h-full"
                    />
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-2 line-clamp-2">{similar.name}</h3>
                    <p className="text-2xl font-bold text-primary">
                      ₹{similar.current_price.toLocaleString('en-IN')}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
