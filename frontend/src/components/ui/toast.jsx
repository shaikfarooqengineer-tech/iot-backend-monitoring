import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva } from "class-variance-authority"
import { X, AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react"

import { cn } from "@/lib/utils"

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed top-4 right-4 z-[100] flex max-h-screen w-full flex-col gap-2 p-0 sm:bottom-auto sm:right-4 sm:top-4 md:max-w-[420px] pointer-events-none",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  "group pointer-events-auto relative w-full overflow-hidden rounded-lg border transition-all duration-300 data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full",
  {
    variants: {
      variant: {
        default: "border-slate-200 bg-white text-slate-950 shadow-lg hover:shadow-xl hover:border-slate-300",
        success: "border-green-200 bg-gradient-to-br from-green-50 to-green-25 text-green-950 shadow-lg hover:shadow-xl hover:border-green-300",
        destructive: "border-red-200 bg-gradient-to-br from-red-50 to-red-25 text-red-950 shadow-lg hover:shadow-xl hover:border-red-300",
        warning: "border-amber-200 bg-gradient-to-br from-amber-50 to-amber-25 text-amber-950 shadow-lg hover:shadow-xl hover:border-amber-300",
        info: "border-blue-200 bg-gradient-to-br from-blue-50 to-blue-25 text-blue-950 shadow-lg hover:shadow-xl hover:border-blue-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Toast = React.forwardRef(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), "flex items-start gap-3 px-4 py-3 backdrop-blur-sm", className)}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastIcon = React.forwardRef(({ className, variant, ...props }, ref) => {
  const iconMap = {
    default: <Info className="h-5 w-5 text-slate-500 flex-shrink-0 mt-0.5" />,
    success: <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />,
    destructive: <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />,
    info: <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />,
  }

  return (
    <div className={cn("flex-shrink-0", className)} ref={ref} {...props}>
      {iconMap[variant] || iconMap.default}
    </div>
  )
})
ToastIcon.displayName = "ToastIcon"

const ToastContent = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex-1 flex flex-col gap-0.5 min-w-0", className)}
    {...props}
  />
))
ToastContent.displayName = "ToastContent"

const ToastAction = React.forwardRef(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.default]:bg-slate-100 group-[.default]:text-slate-900 group-[.default]:hover:bg-slate-200 group-[.default]:focus:ring-slate-500 group-[.success]:bg-green-100 group-[.success]:text-green-900 group-[.success]:hover:bg-green-200 group-[.success]:focus:ring-green-500 group-[.destructive]:bg-red-100 group-[.destructive]:text-red-900 group-[.destructive]:hover:bg-red-200 group-[.destructive]:focus:ring-red-500 group-[.warning]:bg-amber-100 group-[.warning]:text-amber-900 group-[.warning]:hover:bg-amber-200 group-[.warning]:focus:ring-amber-500 group-[.info]:bg-blue-100 group-[.info]:text-blue-900 group-[.info]:hover:bg-blue-200 group-[.info]:focus:ring-blue-500",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 rounded-md p-1.5 text-slate-400 opacity-0 transition-all hover:text-slate-600 focus:opacity-100 focus:outline-none group-hover:opacity-100 group-[.destructive]:hover:text-red-600 group-[.success]:hover:text-green-600 group-[.warning]:hover:text-amber-600 group-[.info]:hover:text-blue-600",
      className
    )}
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-sm font-semibold leading-tight", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-xs opacity-90 leading-relaxed", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastIcon,
  ToastContent,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}