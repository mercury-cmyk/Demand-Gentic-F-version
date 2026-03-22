import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Monitor, DollarSign, Users, Megaphone, Settings, TrendingUp,
  Scale, ChevronDown, AlertTriangle, Target, Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ==================== Types ====================

export interface DepartmentMapping {
  department: string;
  confidence: number;
  recommendedApproach: string;
  messagingAngle: string;
  painPoints: string[];
  priorities: string[];
  commonObjections: string[];
  problems: Array;
  solutions: Array;
  problemCount: number;
  solutionCount: number;
}

interface DepartmentResultsViewProps {
  departments: DepartmentMapping[];
  primaryDepartment: string | null;
  crossDepartmentAngles?: string[];
}

// ==================== Constants ====================

const DEPT_ICONS: Record = {
  IT: Monitor,
  Finance: DollarSign,
  HR: Users,
  Marketing: Megaphone,
  Operations: Settings,
  Sales: TrendingUp,
  Legal: Scale,
};

const DEPT_COLORS: Record = {
  IT: "border-blue-200 bg-blue-50/50",
  Finance: "border-emerald-200 bg-emerald-50/50",
  HR: "border-purple-200 bg-purple-50/50",
  Marketing: "border-orange-200 bg-orange-50/50",
  Operations: "border-slate-200 bg-slate-50/50",
  Sales: "border-cyan-200 bg-cyan-50/50",
  Legal: "border-amber-200 bg-amber-50/50",
};

const CONFIDENCE_COLORS: Record = {
  high: "bg-green-100 text-green-800 border-green-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-red-100 text-red-800 border-red-200",
};

function getConfidenceLevel(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.4) return "medium";
  return "low";
}

// ==================== Department Card ====================

function DepartmentCard({
  dept,
  isPrimary,
}: {
  dept: DepartmentMapping;
  isPrimary: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = DEPT_ICONS[dept.department] || Settings;
  const colorClass = DEPT_COLORS[dept.department] || "border-gray-200 bg-gray-50/50";
  const confLevel = getConfidenceLevel(dept.confidence);
  const hasData = dept.problemCount > 0 || dept.solutionCount > 0;

  return (
    
      
        
          
            
            {dept.department}
          
          {isPrimary && (
            Primary
          )}
        
        
          
            {Math.round(dept.confidence * 100)}%
          
          
            {dept.problemCount} problems / {dept.solutionCount} solutions
          
        
      

      
        {dept.messagingAngle && (
          
            {dept.messagingAngle}
          
        )}

        {hasData && (
          
            
              
                Details
                
              
            
            
              {dept.problems.length > 0 && (
                
                  
                    
                    Problems
                  
                  
                    {dept.problems.slice(0, 3).map((p) => (
                      
                        {p.problemStatement}
                        
                          {Math.round(p.confidence * 100)}%
                        
                      
                    ))}
                  
                
              )}

              {dept.solutions.length > 0 && (
                
                  
                    
                    Solutions
                  
                  
                    {dept.solutions.slice(0, 3).map((s) => (
                      {s.serviceName}
                    ))}
                  
                
              )}

              {dept.painPoints.length > 0 && (
                
                  Pain Points
                  
                    {dept.painPoints.slice(0, 4).map((p, i) => (
                      
                        {typeof p === "string" ? p : (p as any)?.painPoint || JSON.stringify(p)}
                      
                    ))}
                  
                
              )}

              {dept.commonObjections.length > 0 && (
                
                  Common Objections
                  
                    {dept.commonObjections.slice(0, 2).map((o, i) => (
                      {typeof o === "string" ? o : JSON.stringify(o)}
                    ))}
                  
                
              )}

              
                
                  Approach: {dept.recommendedApproach}
                
              
            
          
        )}
      
    
  );
}

// ==================== Main Component ====================

export function DepartmentResultsView({
  departments,
  primaryDepartment,
  crossDepartmentAngles = [],
}: DepartmentResultsViewProps) {
  const activeDepts = departments.filter((d) => d.problemCount > 0 || d.solutionCount > 0);
  const inactiveDepts = departments.filter((d) => d.problemCount === 0 && d.solutionCount === 0);

  return (
    
      
        
          7-Department Problem-Solution Mapping
        
        
          {activeDepts.length} active / {inactiveDepts.length} no data
        
      

      
        {departments.map((dept) => (
          
        ))}
      

      {crossDepartmentAngles.length > 0 && (
        
          
            
              
              Cross-Department Angles
            
          
          
            
              {crossDepartmentAngles.map((angle, i) => (
                
                  &#8226;
                  {angle}
                
              ))}
            
          
        
      )}
    
  );
}