import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3.5 shadow-xs [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground transition-all duration-200",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground border-border",
        destructive:
          "border-destructive/50 bg-destructive/5 text-destructive dark:border-destructive [&>svg]:text-destructive",
        success:
          "border-success/50 bg-success/5 text-success [&>svg]:text-success",
        warning:
          "border-warning/50 bg-warning/5 text-warning [&>svg]:text-warning",
        info:
          "border-info/50 bg-info/5 text-info [&>svg]:text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef & VariantProps
>(({ className, variant, ...props }, ref) => (
  
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef
>(({ className, ...props }, ref) => (
  
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef
>(({ className, ...props }, ref) => (
  
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }