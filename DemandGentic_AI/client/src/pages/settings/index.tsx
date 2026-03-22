/**
 * Settings Hub Index Page
 *
 * Main landing page for the Settings Hub. Shows overview of all settings areas.
 */

import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SettingsLayout, SETTINGS_NAV, CATEGORIES } from '@/components/settings/settings-layout';
import { ChevronRight } from 'lucide-react';

export default function SettingsIndexPage() {
  return (
    
      
        {CATEGORIES.map(category => {
          const items = SETTINGS_NAV.filter(item => item.category === category.id);
          if (items.length === 0) return null;

          return (
            
              {category.label} Settings
              
                {items.map(item => {
                  const Icon = item.icon;
                  return (
                    
                      
                        
                          
                            
                              
                                
                              
                              {item.label}
                            
                            
                          
                        
                        
                          {item.description}
                        
                      
                    
                  );
                })}
              
            
          );
        })}
      
    
  );
}