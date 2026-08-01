/**
 * Lazy-loaded Icon Components
 * ✅ Reduces initial bundle size by deferring icon imports
 * Icons are loaded on-demand when Header component renders
 */

export const Icons = {
  // Load icons dynamically to reduce bundle
  Menu: () => import('lucide-react').then(m => m.Menu),
  Mic: () => import('lucide-react').then(m => m.Mic),
  MicOff: () => import('lucide-react').then(m => m.MicOff),
  Search: () => import('lucide-react').then(m => m.Search),
  Upload: () => import('lucide-react').then(m => m.Upload),
  Video: () => import('lucide-react').then(m => m.Video),
  Loader2: () => import('lucide-react').then(m => m.Loader2),
  Bell: () => import('lucide-react').then(m => m.Bell),
  History: () => import('lucide-react').then(m => m.History),
  Settings: () => import('lucide-react').then(m => m.Settings),
  User: () => import('lucide-react').then(m => m.User),
  LogOut: () => import('lucide-react').then(m => m.LogOut),
  X: () => import('lucide-react').then(m => m.X),
  TrendingUp: () => import('lucide-react').then(m => m.TrendingUp),
  Clock: () => import('lucide-react').then(m => m.Clock),
  Zap: () => import('lucide-react').then(m => m.Zap),
  Home: () => import('lucide-react').then(m => m.Home),
  Compass: () => import('lucide-react').then(m => m.Compass),
  Library: () => import('lucide-react').then(m => m.Library),
  ThumbsUp: () => import('lucide-react').then(m => m.ThumbsUp),
  PlaySquare: () => import('lucide-react').then(m => m.PlaySquare),
  Radio: () => import('lucide-react').then(m => m.Radio),
  ArrowRight: () => import('lucide-react').then(m => m.ArrowRight),
  Scissors: () => import('lucide-react').then(m => m.Scissors),
  Plus: () => import('lucide-react').then(m => m.Plus),
};

// For immediate use, still import the most critical icons eagerly
// These will be used in initial render
import {
  Menu, Mic, MicOff, Search as SearchIcon, Upload, Video as VideoIcon,
  Loader2, Bell, History, Settings, User, LogOut, X,
  TrendingUp, Clock, Zap, Home, Compass, Library, ThumbsUp, PlaySquare,
  Radio, ArrowRight, Scissors, Plus,
} from "lucide-react";

export const EagerIcons = {
  Menu, Mic, MicOff, SearchIcon, Upload, VideoIcon,
  Loader2, Bell, History, Settings, User, LogOut, X,
  TrendingUp, Clock, Zap, Home, Compass, Library, ThumbsUp, PlaySquare,
  Radio, ArrowRight, Scissors, Plus,
};
