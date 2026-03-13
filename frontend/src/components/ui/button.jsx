import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // UX changes: added `rounded` (exactly 4px in Tailwind), active:scale-[0.98] for click feel
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded text-sm font-semibold ring-offset-white transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          // Explicitly text-white with your primary color #4F46E5
          "bg-[#4F46E5] text-white shadow-sm shadow-[#4F46E5]/20 hover:bg-[#4338ca] hover:shadow-md hover:shadow-[#4F46E5]/30",
        
        destructive:
          "bg-red-500 text-white shadow-sm hover:bg-red-600",
        
        outline:
          "border border-gray-200 bg-white text-gray-700 shadow-sm hover:border-[#4F46E5] hover:text-[#4F46E5] hover:bg-gray-50",
        
        secondary:
          "bg-[#4F46E5]/10 text-[#4F46E5] hover:bg-[#4F46E5]/20",
        
        ghost: 
          "text-gray-600 hover:bg-[#4F46E5]/10 hover:text-[#4F46E5]",
        
        link: 
          "text-[#4F46E5] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
