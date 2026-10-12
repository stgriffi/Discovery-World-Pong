#! /bin/sh
# Creates the Firefox kiosk profiles (if they don't exist yet) and writes each profile's
# user.js, which Firefox applies on every start. Safe to re-run.

# This allows the script to be run over a SSH session. It's almost always 0, but
# There has been an occasion where it's been switched to 1 for some reason. This
# should be sorted out and hardened at some point.
export DISPLAY=:0

PROFILES="neural-net-visualizer clocktower-visualizer human-visualizer gameboard"

# Profile directories are named <random>.<profile>; the snap Firefox keeps them under ~/snap.
profile_dir() {
  for base in "$HOME/snap/firefox/common/.mozilla/firefox" "$HOME/.mozilla/firefox"; do
    for dir in "$base"/*."$1"; do
      if [ -d "$dir" ]; then
        echo "$dir"
        return
      fi
    done
  done
}

for profile in $PROFILES; do
  dir=$(profile_dir "$profile")
  if [ -z "$dir" ]; then
    firefox -CreateProfile "$profile"
    dir=$(profile_dir "$profile")
  fi
  if [ -z "$dir" ]; then
    echo "Could not find or create the Firefox profile '$profile'" >&2
    continue
  fi
  cat > "$dir/user.js" <<'PREFS'
// Written by setup/create_profiles.sh; edits here are overwritten.
// Play audio without a click: the exhibit is unattended, and TYLER advances the game when
// its voice clips finish.
user_pref("media.autoplay.default", 0);
user_pref("media.autoplay.blocking_policy", 0);
user_pref("media.autoplay.block-webaudio", false);
user_pref("media.block-autoplay-until-in-foreground", false);
// After a crash, just reload the page instead of offering to restore the session.
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.tabs.crashReporting.sendReport", false);
PREFS
  echo "Wrote $dir/user.js"
done

exit 0
