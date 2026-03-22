import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useExportAuthority } from "@/hooks/use-export-authority";
import { Download, BarChart3, TrendingUp, Mail, Phone } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart, 
  Bar, 
  LineChart,
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";

const campaignPerformance = [
  { name: 'Jan', email: 65, calls: 45 },
  { name: 'Feb', email: 78, calls: 52 },
  { name: 'Mar', email: 85, calls: 61 },
  { name: 'Apr', email: 72, calls: 48 },
  { name: 'May', email: 91, calls: 67 },
  { name: 'Jun', email: 88, calls: 73 },
];

const leadsBySource = [
  { name: 'Email', value: 45 },
  { name: 'Telemarketing', value: 35 },
  { name: 'Webinar', value: 20 },
];

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))'];

const accountCoverage = [
  { name: 'Technology', accounts: 450, contacts: 3200, penetration: 7.1 },
  { name: 'Manufacturing', accounts: 320, contacts: 2100, penetration: 6.6 },
  { name: 'Healthcare', accounts: 280, contacts: 1800, penetration: 6.4 },
  { name: 'Finance', accounts: 190, contacts: 1500, penetration: 7.9 },
];

export default function ReportsPage() {
  const { canExportData } = useExportAuthority();

  return (
    
      
        
          Reports & Analytics
          
            Comprehensive insights into campaign performance and ABM metrics
          
        
        {canExportData && (
          
            
            Export Report
          
        )}
      

      
        
          
            
            Campaign Performance
          
          
            
            Lead Analytics
          
          
            
            ABM Metrics
          
        

        
          
            
              
                Campaign Performance Trend
              
              
                
                  
                    
                    
                    
                    
                    
                    
                  
                
              
            

            
              
                Lead Sources
              
              
                
                  
                     `${name}: ${value}%`}
                      outerRadius={100}
                      fill="hsl(var(--chart-1))"
                      dataKey="value"
                    >
                      {leadsBySource.map((entry, index) => (
                        
                      ))}
                    
                    
                  
                
              
            
          

          
            
              Email Campaign Metrics
            
            
              
                
                  24,567
                  Sent
                
                
                  24,234
                  Delivered (98.6%)
                
                
                  9,847
                  Opened (40.6%)
                
                
                  2,456
                  Clicked (24.9%)
                
                
                  145
                  Bounced (0.6%)
                
              
            
          

          
            
              Telemarketing Call Metrics
            
            
              
                
                  1,847
                  Total Attempts
                
                
                  892
                  Connected (48.3%)
                
                
                  456
                  Qualified (51.1%)
                
                
                  18m 34s
                  Avg Talk Time
                
                
                  234
                  Callbacks
                
              
            
          
        

        
          
            
              Lead Quality Metrics
            
            
              
                
                  487
                  Total Leads
                
                
                  376
                  Approved (77.2%)
                
                
                  68
                  Pending Review
                
                
                  43
                  Rejected (8.8%)
                
              
            
          
        

        
          
            
              Account Coverage & Penetration
            
            
              
                {accountCoverage.map((industry) => (
                  
                    
                      {industry.name}
                      
                        Avg {industry.penetration} contacts/account
                      
                    
                    
                      
                        Accounts: 
                        {industry.accounts}
                      
                      
                        Contacts: 
                        {industry.contacts}
                      
                    
                  
                ))}
              
            
          

          
            
              Industry Distribution
            
            
              
                
                  
                  
                  
                  
                  
                
              
            
          
        
      
    
  );
}