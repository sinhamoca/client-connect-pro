import { Construction } from "lucide-react";

const ComingSoon = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
    <Construction className="h-16 w-16 text-muted-foreground mb-4" />
    <h1 className="text-2xl font-bold mb-2">{title}</h1>
    <p className="text-muted-foreground">Este módulo será implementado em breve.</p>
  </div>
);

export default ComingSoon;
