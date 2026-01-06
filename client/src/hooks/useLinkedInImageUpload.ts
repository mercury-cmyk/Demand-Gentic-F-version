/**
 * Hook for LinkedIn image upload workflow
 * Handles presigned URL generation and S3 upload
 */

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export interface UseLinkedInImageUploadResult {
  file: File | null;
  preview: string | null;
  uploadedUrl: string | null;
  isUploading: boolean;
  selectFile: (file: File) => void;
  uploadToS3: (leadId: string) => Promise<string | null>;
  reset: () => void;
}

export function useLinkedInImageUpload(): UseLinkedInImageUploadResult {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const selectFile = (selectedFile: File) => {
    // Validate file type
    if (!selectedFile.type.match(/^image\/(jpeg|jpg|png|webp)$/)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a JPEG, PNG, or WebP image',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (5MB max)
    if (selectedFile.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Image must be less than 5MB',
        variant: 'destructive',
      });
      return;
    }

    setFile(selectedFile);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(selectedFile);
  };

  const uploadToS3 = async (leadId: string): Promise<string | null> => {
    if (!file) return null;

    setIsUploading(true);

    try {
      // Step 1: Get presigned upload URL
      const { ok, uploadUrl, publicUrl }: any = await apiRequest('POST', '/api/linkedin-verification/upload-url', {
        leadId,
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
      });
      
      if (!ok || !uploadUrl) {
        throw new Error('Failed to get upload URL');
      }

      // Step 2: Upload to S3 using presigned URL
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('S3 upload failed');
      }

      setUploadedUrl(publicUrl);

      toast({
        title: 'Image uploaded',
        description: 'LinkedIn screenshot uploaded successfully',
      });

      return publicUrl;
    } catch (error) {
      console.error('LinkedIn image upload failed:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload image',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setUploadedUrl(null);
    setIsUploading(false);
  };

  return {
    file,
    preview,
    uploadedUrl,
    isUploading,
    selectFile,
    uploadToS3,
    reset,
  };
}
