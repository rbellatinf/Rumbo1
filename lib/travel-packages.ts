export type TravelPackage = {
  id: string;
  destination: string;
  country: string;
  image: string;
  imagePosition: string;
  duration: string;
  rating: string;
  reviews: string;
  price: string;
  previousPrice: string;
  tag: string;
  included: string[];
  variantId?: string;
};

export const demoTravelPackages: TravelPackage[] = [
  {
    id: "cusco",
    destination: "Cusco esencial",
    country: "Perú",
    image: "/images/rumbo-hero.jpg",
    imagePosition: "70% 58%",
    duration: "4 días / 3 noches",
    rating: "4.9",
    reviews: "328",
    price: "S/ 1,249",
    previousPrice: "S/ 1,490",
    tag: "Más elegido",
    included: [
      "Vuelo ida y vuelta",
      "Hotel con desayuno",
      "Traslados incluidos",
    ],
  },
  {
    id: "punta-cana",
    destination: "Punta Cana total",
    country: "República Dominicana",
    image: "/images/rumbo-beach.jpg",
    imagePosition: "center",
    duration: "6 días / 5 noches",
    rating: "4.8",
    reviews: "214",
    price: "US$ 749",
    previousPrice: "US$ 920",
    tag: "Todo incluido",
    included: [
      "Vuelo ida y vuelta",
      "Resort all inclusive",
      "Traslado al aeropuerto",
    ],
  },
  {
    id: "cartagena",
    destination: "Cartagena con encanto",
    country: "Colombia",
    image: "/images/rumbo-city.jpg",
    imagePosition: "center",
    duration: "5 días / 4 noches",
    rating: "4.7",
    reviews: "189",
    price: "US$ 579",
    previousPrice: "US$ 699",
    tag: "Precio especial",
    included: ["Vuelo ida y vuelta", "Hotel boutique", "City tour histórico"],
  },
];

