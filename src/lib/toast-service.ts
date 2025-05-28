import { useToast } from "@/components/ui/use-toast";

const DEFAULT_SUCCESS_DURATION = 3000; // 3 seconds
const DEFAULT_INFO_DURATION = 2000;    // 2 seconds, slightly shorter for brief info

export function useAppToast() {
  const { toast } = useToast();

  const showSuccessToast = (message: string, duration: number = DEFAULT_SUCCESS_DURATION) => {
    toast({
      // Omitting title for a cleaner look as per common modern toast design
      // title: "Success", 
      description: message,
      duration: duration,
      // className: "bg-green-500 text-white" // Example for custom styling, can be adapted later
    });
  };

  const showInfoToast = (message: string, duration: number = DEFAULT_INFO_DURATION) => {
    toast({
      // Omitting title for info as well
      // title: "Info",
      description: message,
      duration: duration,
    });
  };

  // Placeholder for error toasts to be implemented later
  // const showErrorToast = (title: string, message: string) => {
  //   toast({
  //     variant: "destructive", // shadcn/ui often has a 'destructive' variant
  //     title: title,
  //     description: message,
  //     action: <ToastAction altText="Dismiss">Dismiss</ToastAction>, // Manual dismiss
  //     duration: Infinity, // Effectively manual dismiss by not auto-hiding
  //   });
  // };

  return { showSuccessToast, showInfoToast /*, showErrorToast */ };
} 