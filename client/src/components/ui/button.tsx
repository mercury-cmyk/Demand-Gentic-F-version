import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium font-sans tracking-tight ring-offset-background transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:translate-y-px",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-primary text-primary-foreground border border-primary/20 shadow-sm hover:shadow-md hover:-translate-y-px",
        destructive:
          "bg-destructive text-destructive-foreground border border-destructive-border shadow-sm hover:shadow-md hover:-translate-y-px",
        outline:
          "border border-input bg-background/60 text-foreground shadow-xs hover:bg-accent/70 hover:text-accent-foreground hover:shadow-sm",
        secondary: 
          "bg-secondary text-secondary-foreground border border-secondary-border shadow-xs hover:shadow-sm hover:bg-secondary/80",
        ghost: 
          "border border-transparent hover:bg-accent/70 hover:text-accent-foreground",
        link: 
          "text-primary underline-offset-4 hover:underline border border-transparent",
      },
      size: {
        default: "h-10 px-5 py-2.5",
        sm: "h-9 rounded-md px-3.5 text-xs",
        lg: "h-11 rounded-lg px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
