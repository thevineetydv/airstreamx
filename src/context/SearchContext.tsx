import React, { createContext, useContext, useState, useCallback } from "react";

type SortOption = 'newest' | 'oldest' | 'popular' | 'views' | 'relevance';
type FilterOption = 'all' | 'today' | 'week' | 'month' | 'year';
type ViewMode = 'grid' | 'list';

type SearchContextType = {
  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  clearSearch: () => void;
  
  // Filters & Sort
  sortBy: SortOption;
  setSortBy: (sort: SortOption) => void;
  filterBy: FilterOption;
  setFilterBy: (filter: FilterOption) => void;
  
  // View Mode
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  
  // Search History
  searchHistory: string[];
  addToHistory: (query: string) => void;
  clearHistory: () => void;
  
  // Active Filters Count
  activeFiltersCount: number;
  resetAllFilters: () => void;
  
  // Category/Tags
  selectedCategory: string | null;
  setSelectedCategory: (category: string | null) => void;
  selectedTags: string[];
  toggleTag: (tag: string) => void;
  clearTags: () => void;
};

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export const SearchProvider = ({ children }: { children: React.ReactNode }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("relevance");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  // Add to search history (max 10 items, no duplicates)
  const addToHistory = useCallback((query: string) => {
    if (!query.trim()) return;
    
    setSearchHistory(prev => {
      const filtered = prev.filter(item => item !== query);
      return [query, ...filtered].slice(0, 10);
    });
  }, []);

  // Clear search history
  const clearHistory = useCallback(() => {
    setSearchHistory([]);
  }, []);

  // Toggle tag selection
  const toggleTag = useCallback((tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  }, []);

  // Clear all tags
  const clearTags = useCallback(() => {
    setSelectedTags([]);
  }, []);

  // Count active filters
  const activeFiltersCount = 
    (filterBy !== 'all' ? 1 : 0) +
    (selectedCategory ? 1 : 0) +
    selectedTags.length;

  // Reset all filters
  const resetAllFilters = useCallback(() => {
    setSortBy("relevance");
    setFilterBy("all");
    setSelectedCategory(null);
    setSelectedTags([]);
  }, []);

  return (
    <SearchContext.Provider 
      value={{ 
        searchQuery, 
        setSearchQuery,
        clearSearch,
        sortBy,
        setSortBy,
        filterBy,
        setFilterBy,
        viewMode,
        setViewMode,
        searchHistory,
        addToHistory,
        clearHistory,
        activeFiltersCount,
        resetAllFilters,
        selectedCategory,
        setSelectedCategory,
        selectedTags,
        toggleTag,
        clearTags,
      }}
    >
      {children}
    </SearchContext.Provider>
  );
};

export const useSearch = () => {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error("useSearch must be used inside a SearchProvider");
  }
  return context;
};

