import { AlertCircle, Car, Construction, CloudRain, ShieldCheck, ShieldAlert, ShieldQuestion, Fuel, Siren } from 'lucide-react';

export type IncidentCategory = 'crime' | 'traffic' | 'infrastructure' | 'weather' | 'gas' | 'emergency';

export type CredibilityStatus = 'unverified' | 'multiple_reports' | 'community_confirmed';

export const CATEGORY_ICONS = {
  crime: AlertCircle,
  traffic: Car,
  infrastructure: Construction,
  weather: CloudRain,
  gas: Fuel,
  emergency: Siren,
};

export const STATUS_ICONS = {
  unverified: ShieldQuestion,
  multiple_reports: ShieldAlert,
  community_confirmed: ShieldCheck
};

export interface Incident {
  id: string;
  title: string;
  description: string;
  category: IncidentCategory;
  neighborhood: string;
  lat: number;
  lng: number;
  timestamp: number;
  email: string;
  name: string;
  anonymous?: boolean;
  verified_status: CredibilityStatus;
  image_url?: string;
  report_count: number;
  source_url?: string;
  source_logo?: string;
  source_name?: string;
  deleted?: boolean;
  deletedAt?: number;
  deletedBy?: string;
}

export interface CommunityStats {
  community: string;
  month: string;
  violent_crime: number;
  property_crime: number;
  disorder_calls: number;
  safety_score: number;
}

export interface AreaIntelligence {
  communityName: string;
  safetyScore: number;
  description: string;
  activeIncidents: number;
  trend: 'improving' | 'declining' | 'stable';
  monthlyTrends: {
    month: string;
    violent_crime: number;
    property_crime: number;
    disorder_calls: number;
  }[];
  insights: string[];
  liveOverlayInsight: string;
}
