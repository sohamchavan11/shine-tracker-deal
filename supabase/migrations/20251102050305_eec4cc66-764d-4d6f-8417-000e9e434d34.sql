-- Create product_reviews table for customer feedback
CREATE TABLE public.product_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT NOT NULL,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

-- Create policy for viewing reviews
CREATE POLICY "Anyone can view product reviews" 
ON public.product_reviews 
FOR SELECT 
USING (true);

-- Create policy for inserting reviews (authenticated users only)
CREATE POLICY "Authenticated users can insert reviews" 
ON public.product_reviews 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Create index for faster product review lookups
CREATE INDEX idx_product_reviews_product_id ON public.product_reviews(product_id);
CREATE INDEX idx_product_reviews_created_at ON public.product_reviews(created_at DESC);