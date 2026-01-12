import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { RecordingDetailClient } from "@/components/recordings/recording-detail-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RecordingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Check if user is logged in
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch the recording without user_id filter for public access
  const { data: recording, error } = await supabase
    .from("recordings")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !recording) {
    notFound();
  }

  // Check if current user is the owner
  const isOwner = user?.id === recording.user_id;

  // Fetch user settings only if owner
  let saveAudioEnabled = false;
  if (isOwner && user) {
    const { data: userSettings } = await supabase
      .from("users")
      .select("save_audio_enabled")
      .eq("id", user.id)
      .single();
    saveAudioEnabled = userSettings?.save_audio_enabled ?? false;
  }

  return (
    <RecordingDetailClient
      recording={recording}
      saveAudioEnabled={saveAudioEnabled}
      isOwner={isOwner}
    />
  );
}
