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
  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx >= oldLines.length) {
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

      if (oldInNew !== -1 && (newInOld === -1 || oldInNew - newIdx < newInOld - oldIdx)) {
        // Old line found later in new - these are additions
        result.push({ type: 'add', line: newLines[newIdx] });
        newIdx++;
      } else {
        // Old line not found or new line appears first - this is a removal
        result.push({ type: 'remove', line: oldLines[oldIdx] });
        oldIdx++;
      }
    }
  }

  return result;
}

function DiffLine({ type, line, lineNumber }: { type: 'same' | 'add' | 'remove'; line: string; lineNumber: number }) {
  const bgColor = {
    same: 'bg-transparent',
    add: 'bg-green-100 dark:bg-green-950/30',
    remove: 'bg-red-100 dark:bg-red-950/30',
  }[type];

  const textColor = {
    same: 'text-muted-foreground',
    add: 'text-green-700 dark:text-green-300',
    remove: 'text-red-700 dark:text-red-300',
  }[type];

  const prefix = {
    same: ' ',
    add: '+',
    remove: '-',
  }[type];

  return (
    <div className={`flex font-mono text-sm ${bgColor}`}>
      <span className="w-10 flex-shrink-0 text-right pr-2 text-muted-foreground border-r select-none">
        {lineNumber}
      </span>
      <span className={`w-6 flex-shrink-0 text-center ${textColor}`}>
        {prefix}
      </span>
      <span className={`flex-1 whitespace-pre-wrap ${textColor}`}>
        {line || ' '}
      </span>
    </div>
  );
}

function ModificationDiff({ oldContent, newContent }: { oldContent: string; newContent: string }) {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  const lineDiff = computeLineDiff(oldContent, newContent);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant={viewMode === 'unified' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('unified')}
        >
          Unified
        </Button>
        <Button
          variant={viewMode === 'split' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('split')}
        >
          Split
        </Button>
      </div>

      {viewMode === 'unified' ? (
        <ScrollArea className="h-[400px] rounded-lg border">
          <div className="p-2">
            {lineDiff.map((item, idx) => (
              <DiffLine key={idx} type={item.type} line={item.line} lineNumber={idx + 1} />
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-sm font-medium mb-1 text-red-600 dark:text-red-400 flex items-center gap-1">
              <Minus className="h-4 w-4" /> Previous
            </div>
            <ScrollArea className="h-[400px] rounded-lg border bg-red-50/30 dark:bg-red-950/10">
              <pre className="p-2 text-sm font-mono whitespace-pre-wrap">
                {oldContent}
              </pre>
            </ScrollArea>
          </div>
          <div>
            <div className="text-sm font-medium mb-1 text-green-600 dark:text-green-400 flex items-center gap-1">
              <Plus className="h-4 w-4" /> Current
            </div>
            <ScrollArea className="h-[400px] rounded-lg border bg-green-50/30 dark:bg-green-950/10">
              <pre className="p-2 text-sm font-mono whitespace-pre-wrap">
                {newContent}
              </pre>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}

export function KnowledgeDiffViewer({ diff, versionA, versionB, onClose }: KnowledgeDiffViewerProps) {
  const totalChanges = diff.additions.length + diff.removals.length + diff.modifications.length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Changes between v{versionA} and v{versionB}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-green-600">
                <Plus className="h-3 w-3 mr-1" />
                {diff.additions.length} Added
              </Badge>
              <Badge variant="destructive">
                <Minus className="h-3 w-3 mr-1" />
                {diff.removals.length} Removed
              </Badge>
              <Badge variant="secondary" className="bg-yellow-200 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200">
                <Edit2 className="h-3 w-3 mr-1" />
                {diff.modifications.length} Modified
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {totalChanges === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No differences between these versions</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="modifications">
          <TabsList>
            <TabsTrigger value="modifications" className="gap-1">
              <Edit2 className="h-4 w-4" />
              Modified ({diff.modifications.length})
            </TabsTrigger>
            <TabsTrigger value="additions" className="gap-1">
              <Plus className="h-4 w-4" />
              Added ({diff.additions.length})
            </TabsTrigger>
            <TabsTrigger value="removals" className="gap-1">
              <Minus className="h-4 w-4" />
              Removed ({diff.removals.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="modifications" className="space-y-4">
            {diff.modifications.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  No modified sections
                </CardContent>
              </Card>
            ) : (
              diff.modifications.map((mod, idx) => (
                <Card key={idx}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900/30">
                        {mod.sectionId}
                      </Badge>
                      Modified
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ModificationDiff oldContent={mod.oldContent} newContent={mod.newContent} />
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="additions" className="space-y-4">
            {diff.additions.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  No added sections
                </CardContent>
              </Card>
            ) : (
              diff.additions.map((add, idx) => (
                <Card key={idx} className="border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Plus className="h-4 w-4 text-green-600" />
                      <Badge variant="outline" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                        {add.sectionId}
                      </Badge>
                      Added
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[200px] rounded-lg border bg-green-100/50 dark:bg-green-950/20">
                      <pre className="p-4 text-sm font-mono whitespace-pre-wrap text-green-700 dark:text-green-300">
                        {add.content}
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="removals" className="space-y-4">
            {diff.removals.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  No removed sections
                </CardContent>
              </Card>
            ) : (
              diff.removals.map((rem, idx) => (
                <Card key={idx} className="border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Minus className="h-4 w-4 text-red-600" />
                      <Badge variant="outline" className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                        {rem.sectionId}
                      </Badge>
                      Removed
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[200px] rounded-lg border bg-red-100/50 dark:bg-red-950/20">
                      <pre className="p-4 text-sm font-mono whitespace-pre-wrap text-red-700 dark:text-red-300 line-through">
                        {rem.content}
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      )}

      {onClose && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close Comparison
          </Button>
        </div>
      )}
    </div>
  );
}

export default KnowledgeDiffViewer;
