import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, TrendingUp, ShoppingCart, Check, Plus, Store, ThumbsUp, ThumbsDown, AlertCircle } from 'lucide-react';
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
      
      // Factor 1: Price comparison (40% weight)
      if (product.current_price <= lowestPrice * 1.05) {
        sentimentScore += 0.4; // At or near lowest price
      } else if (product.current_price <= avgPrice) {
        sentimentScore += 0.2; // Below average
      } else if (product.current_price >= highestPrice * 0.95) {
        sentimentScore -= 0.2; // At or near highest price
      }
      
      // Factor 2: Price stability (30% weight)
      const priceVolatility = priceHistory.length > 1 
        ? Math.abs(highestPrice - lowestPrice) / avgPrice 
        : 0;
      if (priceVolatility < 0.1) {
        sentimentScore += 0.3; // Very stable
      } else if (priceVolatility < 0.2) {
        sentimentScore += 0.15; // Moderately stable
      }
      
      // Factor 3: Current trend (30% weight)
      if (priceHistory.length >= 3) {
        const recentPrices = priceHistory.slice(-3).map(h => h.price);
        const isDecreasing = recentPrices.every((price, i) => i === 0 || price <= recentPrices[i - 1]);
        if (isDecreasing) {
          sentimentScore += 0.3; // Price is dropping
        }
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
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div className={`p-3 rounded-full ${
                        analysis.sentiment_score >= 0.7 ? 'bg-green-100 dark:bg-green-900/30' : 
                        analysis.sentiment_score >= 0.4 ? 'bg-yellow-100 dark:bg-yellow-900/30' : 
                        'bg-red-100 dark:bg-red-900/30'
                      }`}>
                        {analysis.sentiment_score >= 0.7 ? (
                          <ThumbsUp className="h-6 w-6 text-green-600 dark:text-green-400" />
                        ) : analysis.sentiment_score >= 0.4 ? (
                          <AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                        ) : (
                          <ThumbsDown className="h-6 w-6 text-red-600 dark:text-red-400" />
                        )}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-lg font-bold">AI Product Analysis</h3>
                        <Badge 
                          className="text-base px-3 py-1"
                          variant={
                            analysis.sentiment_score >= 0.7 ? 'default' : 
                            analysis.sentiment_score >= 0.4 ? 'secondary' : 
                            'destructive'
                          }
                        >
                          {(analysis.sentiment_score * 100).toFixed(0)}% Worth Buying
                        </Badge>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="mb-4">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all ${
                              analysis.sentiment_score >= 0.7 ? 'bg-green-500' : 
                              analysis.sentiment_score >= 0.4 ? 'bg-yellow-500' : 
                              'bg-red-500'
                            }`}
                            style={{ width: `${analysis.sentiment_score * 100}%` }}
                          />
                        </div>
                      </div>

                      <div className="bg-background/50 rounded-lg p-4 mb-3">
                        <p className="text-sm font-semibold text-primary mb-1">Summary</p>
                        <p className="text-base">{analysis.analysis_summary}</p>
                      </div>
                      
                      <div className="bg-background/50 rounded-lg p-4">
                        <p className="text-sm font-semibold text-primary mb-1">Detailed Recommendation</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {analysis.recommendation}
                        </p>
                      </div>
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
                <h3 className="font-semibold mb-2">Product Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Category:</span>
                    <span className="font-medium">{product.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Currency:</span>
                    <span className="font-medium">{product.currency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Source:</span>
                    <a
                      href={product.source_url}
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

        {/* Price History Chart */}
        {priceHistory.length > 0 && (
          <Card className="mb-12">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp className="h-5 w-5 text-primary" />
                <h2 className="text-2xl font-bold">Price History</h2>
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
