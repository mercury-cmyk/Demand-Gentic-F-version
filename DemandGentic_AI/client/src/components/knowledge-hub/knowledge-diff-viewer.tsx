/**
 * Knowledge Diff Viewer Component
 * 
 * Displays visual diffs between knowledge versions with:
 * - Green highlighting for additions
 * - Red highlighting for removals
 * - Yellow highlighting for modifications
 * - Side-by-side and inline diff views
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Minus, Edit2, FileText } from 'lucide-react';

interface DiffSection {
  sectionId: string;
  oldContent?: string;
  newContent?: string;
}

interface DiffResult {
  additions: { sectionId: string; content: string }[];
  removals: { sectionId: string; content: string }[];
  modifications: { sectionId: string; oldContent: string; newContent: string }[];
}

interface KnowledgeDiffViewerProps {
  diff: DiffResult;
  versionA: number;
  versionB: number;
  onClose?: () => void;
}

/**
 * Simple line-by-line diff for text content
 */
function computeLineDiff(oldText: string, newText: string): { type: 'same' | 'add' | 'remove'; line: string }[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: { type: 'same' | 'add' | 'remove'; line: string }[] = [];

  let oldIdx = 0;
  let newIdx = 0;

  // Simple diff algorithm - not optimal but good for visualization
  while (oldIdx = oldLines.length) {
      // Remaining new lines are additions
      result.push({ type: 'add', line: newLines[newIdx] });
      newIdx++;
    } else if (newIdx >= newLines.length) {
      // Remaining old lines are removals
      result.push({ type: 'remove', line: oldLines[oldIdx] });
      oldIdx++;
    } else if (oldLines[oldIdx] === newLines[newIdx]) {
      // Lines match
      result.push({ type: 'same', line: oldLines[oldIdx] });
      oldIdx++;
      newIdx++;
    } else {
      // Lines differ - check if it's an addition or removal
      const oldInNew = newLines.indexOf(oldLines[oldIdx], newIdx);
      const newInOld = oldLines.indexOf(newLines[newIdx], oldIdx);

      if (oldInNew !== -1 && (newInOld === -1 || oldInNew - newIdx 
      
        {lineNumber}
      
      
        {prefix}
      
      
        {line || ' '}
      
    
  );
}

function ModificationDiff({ oldContent, newContent }: { oldContent: string; newContent: string }) {
  const [viewMode, setViewMode] = useState('unified');
  const lineDiff = computeLineDiff(oldContent, newContent);

  return (
    
      
         setViewMode('unified')}
        >
          Unified
        
         setViewMode('split')}
        >
          Split
        
      

      {viewMode === 'unified' ? (
        
          
            {lineDiff.map((item, idx) => (
              
            ))}
          
        
      ) : (
        
          
            
               Previous
            
            
              
                {oldContent}
              
            
          
          
            
               Current
            
            
              
                {newContent}
              
            
          
        
      )}
    
  );
}

export function KnowledgeDiffViewer({ diff, versionA, versionB, onClose }: KnowledgeDiffViewerProps) {
  const totalChanges = diff.additions.length + diff.removals.length + diff.modifications.length;

  return (
    
      {/* Summary */}
      
        
          
            
              Changes between v{versionA} and v{versionB}
            
            
              
                
                {diff.additions.length} Added
              
              
                
                {diff.removals.length} Removed
              
              
                
                {diff.modifications.length} Modified
              
            
          
        
      

      {totalChanges === 0 ? (
        
          
            
              
              No differences between these versions
            
          
        
      ) : (
        
          
            
              
              Modified ({diff.modifications.length})
            
            
              
              Added ({diff.additions.length})
            
            
              
              Removed ({diff.removals.length})
            
          

          
            {diff.modifications.length === 0 ? (
              
                
                  No modified sections
                
              
            ) : (
              diff.modifications.map((mod, idx) => (
                
                  
                    
                      
                        {mod.sectionId}
                      
                      Modified
                    
                  
                  
                    
                  
                
              ))
            )}
          

          
            {diff.additions.length === 0 ? (
              
                
                  No added sections
                
              
            ) : (
              diff.additions.map((add, idx) => (
                
                  
                    
                      
                      
                        {add.sectionId}
                      
                      Added
                    
                  
                  
                    
                      
                        {add.content}
                      
                    
                  
                
              ))
            )}
          

          
            {diff.removals.length === 0 ? (
              
                
                  No removed sections
                
              
            ) : (
              diff.removals.map((rem, idx) => (
                
                  
                    
                      
                      
                        {rem.sectionId}
                      
                      Removed
                    
                  
                  
                    
                      
                        {rem.content}
                      
                    
                  
                
              ))
            )}
          
        
      )}

      {onClose && (
        
          
            Close Comparison
          
        
      )}
    
  );
}

export default KnowledgeDiffViewer;