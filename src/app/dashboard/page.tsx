import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Welcome to your app</CardTitle>
          <CardDescription>
            This is the main authenticated page with the sidebar navigation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Use the menu on the left to navigate through the experience.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
