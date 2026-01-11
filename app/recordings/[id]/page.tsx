import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { RecordingDetailClient } from "@/components/recordings/recording-detail-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RecordingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  // Fetch the recording on the server
  const { data: recording, error } = await supabase
    .from("recordings")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  // Fetch user settings
  const { data: userSettings } = await supabase
    .from("users")
    .select("save_audio_enabled")
    .eq("id", user.id)
    .single();

  const saveAudioEnabled = userSettings?.save_audio_enabled ?? false;

  if (error || !recording) {
    notFound();
  }

  return <RecordingDetailClient recording={recording} saveAudioEnabled={saveAudioEnabled} />;
}
