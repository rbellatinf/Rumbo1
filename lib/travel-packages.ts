export type TravelPackageImage = {
  id?: string;
  url: string;
  alt?: string;
  sortOrder?: number;
  isPrimary?: boolean;
};

export type TravelPackage = {
  id: string;
  destination: string;
  country: string;
  image: string;
  images?: TravelPackageImage[];
  imagePosition: string;
  duration: string;
  rating: string;
  reviews: string;
  price: string;
  previousPrice: string;
  tag: string;
  included: string[];
  capacity?: number;
  departureDate?: string;
  returnDate?: string;
  priceAmount?: number;
  currency?: string;
  bookable?: boolean;
  variantId?: string;
  provider?: "Rumbo" | "Spree" | "PriceTravel";
  providerReference?: string;
  originIata?: string;
  lowStock?: boolean;
  activeDepartureCount?: number;
};
