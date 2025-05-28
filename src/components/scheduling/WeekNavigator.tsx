import React from "react";
import { Button } from "@/components/ui/button";

interface WeekNavigatorProps {
  weekStart: Date;
  onPrev: () => void;
  onNext: () => void;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const WeekNavigator: React.FC<WeekNavigatorProps> = ({ weekStart, onPrev, onNext }) => {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return (
    <div className="flex items-center justify-center gap-4">
      <Button variant="outline" size="sm" onClick={onPrev}>
        &larr; Prev
      </Button>
      <span className="font-medium text-lg">
        {formatDate(weekStart)} - {formatDate(weekEnd)}
      </span>
      <Button variant="outline" size="sm" onClick={onNext}>
        Next &rarr;
      </Button>
    </div>
  );
};

export default WeekNavigator; 