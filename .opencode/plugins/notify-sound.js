export const NotifySoundPlugin = async ({ $ }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await $`powershell -NoProfile -Command "[Console]::Beep(523,150); Start-Sleep -Milliseconds 100; [Console]::Beep(659,150); Start-Sleep -Milliseconds 100; [Console]::Beep(784,350)"`;
      } else if (event.type === "permission.asked") {
        await $`powershell -NoProfile -Command "[Console]::Beep(660,200); Start-Sleep -Milliseconds 120; [Console]::Beep(660,200)"`;
      } else if (event.type === "session.error") {
        await $`powershell -NoProfile -Command "[Console]::Beep(400,300); Start-Sleep -Milliseconds 150; [Console]::Beep(300,400)"`;
      }
    },
  };
};
