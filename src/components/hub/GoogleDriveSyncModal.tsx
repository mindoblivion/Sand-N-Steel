import React, { useState, useEffect } from 'react';
import { PlayerProfile } from '../../types/game';
import { googleSignIn, googleSignOut, initAuth } from '../../services/googleAuth';
import {
  listDriveSaves,
  saveProfileToDrive,
  loadProfileFromDrive,
  deleteDriveSaveFile,
  DriveSaveFile,
} from '../../services/googleDrive';
import { User } from 'firebase/auth';
import {
  Cloud,
  HardDrive,
  UploadCloud,
  DownloadCloud,
  Trash2,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { sounds } from '../../audio/soundEffects';

interface GoogleDriveSyncModalProps {
  currentProfile: PlayerProfile | null;
  onProfileLoaded: (profile: PlayerProfile) => void;
  onClose: () => void;
}

export const GoogleDriveSyncModal: React.FC<GoogleDriveSyncModalProps> = ({
  currentProfile,
  onProfileLoaded,
  onClose,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saves, setSaves] = useState<DriveSaveFile[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = initAuth((currentUser, currentToken) => {
      setUser(currentUser);
      setToken(currentToken);
      if (currentToken) {
        fetchDriveSaves();
      }
    });
    return () => unsub();
  }, []);

  const fetchDriveSaves = async () => {
    try {
      setIsLoading(true);
      const list = await listDriveSaves();
      setSaves(list);
    } catch (e) {
      console.error(e);
      setStatusMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Could not fetch Drive files',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async () => {
    sounds.playClick();
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        const list = await listDriveSaves();
        setSaves(list);
        setStatusMessage({ type: 'success', text: `Connected as ${res.user.displayName || res.user.email}` });
      }
    } catch (e) {
      console.error(e);
      setStatusMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Google authentication failed',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    sounds.playClick();
    await googleSignOut();
    setUser(null);
    setToken(null);
    setSaves([]);
    setStatusMessage({ type: 'success', text: 'Signed out of Google Account.' });
  };

  const handleSaveToDrive = async () => {
    if (!currentProfile) return;
    sounds.playClick();
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const saved = await saveProfileToDrive(currentProfile);
      setStatusMessage({ type: 'success', text: `Saved "${currentProfile.name}" to Google Drive successfully!` });
      await fetchDriveSaves();
    } catch (e) {
      console.error(e);
      setStatusMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Failed to save to Google Drive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadFromDrive = async (fileId: string) => {
    sounds.playClick();
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const profile = await loadProfileFromDrive(fileId);
      onProfileLoaded(profile);
      setStatusMessage({ type: 'success', text: `Loaded "${profile.name}" (LVL ${profile.level}) from Google Drive!` });
    } catch (e) {
      console.error(e);
      setStatusMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Failed to load save from Google Drive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteConfirm = async (fileId: string) => {
    sounds.playClick();
    setIsLoading(true);
    setStatusMessage(null);
    try {
      await deleteDriveSaveFile(fileId);
      setStatusMessage({ type: 'success', text: 'Cloud save file deleted from Google Drive.' });
      setDeleteConfirmId(null);
      await fetchDriveSaves();
    } catch (e) {
      console.error(e);
      setStatusMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Failed to delete file from Google Drive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-neutral-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border-2 border-amber-500/80 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl animate-fadeIn text-amber-100 flex flex-col max-h-[90vh] overflow-y-auto">
        {/* MODAL HEADER */}
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-700 border border-cyan-300 flex items-center justify-center shadow-lg">
              <Cloud className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-serif font-black text-lg sm:text-xl text-amber-100 uppercase tracking-wider">
                Google Drive Cloud Saves
              </h3>
              <div className="text-[11px] font-mono text-neutral-400">
                Backup, Sync & Restore Gladiator Progress
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-amber-200 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* STATUS MESSAGE NOTIFICATION */}
        {statusMessage && (
          <div
            className={`p-3 rounded-xl mb-4 text-xs font-mono flex items-center gap-2 border ${
              statusMessage.type === 'success'
                ? 'bg-green-950/80 border-green-500 text-green-300'
                : 'bg-red-950/80 border-red-500 text-red-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0 text-green-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* AUTHENTICATION STATE */}
        {!user || !token ? (
          <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-800 text-center flex flex-col items-center mb-4">
            <HardDrive className="w-12 h-12 text-amber-400 mb-3 opacity-80" />
            <h4 className="font-serif font-bold text-base text-amber-200 mb-1">
              Connect Google Drive
            </h4>
            <p className="text-xs text-neutral-400 max-w-sm mb-5">
              Sign in with your Google Account to safely backup your gladiator stats, weapons, armor, and arena trophies directly to your personal Google Drive storage.
            </p>

            {/* OFFICIAL GSI SIGN-IN BUTTON */}
            <button
              onClick={handleSignIn}
              disabled={isLoading}
              className="flex items-center gap-3 bg-white hover:bg-neutral-100 text-neutral-800 px-5 py-3 rounded-full font-semibold text-xs sm:text-sm shadow-xl active:scale-95 transition-all cursor-pointer border border-neutral-300"
            >
              <svg className="w-4 h-4" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              <span>{isLoading ? 'Connecting to Drive...' : 'Sign in with Google'}</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* USER CARD */}
            <div className="bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800 flex justify-between items-center">
              <div className="flex items-center gap-3">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Avatar" className="w-9 h-9 rounded-full border border-amber-400" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-amber-600 flex items-center justify-center font-bold text-neutral-950">
                    {user.displayName?.[0] || 'G'}
                  </div>
                )}
                <div>
                  <div className="font-serif font-bold text-xs sm:text-sm text-amber-100">
                    {user.displayName || 'Google Drive User'}
                  </div>
                  <div className="text-[10px] text-neutral-400 font-mono">{user.email}</div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={fetchDriveSaves}
                  disabled={isLoading}
                  className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 cursor-pointer"
                  title="Refresh Drive saves"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={handleSignOut}
                  className="p-2 rounded-xl bg-red-950/60 hover:bg-red-900 border border-red-700 text-red-300 cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* SAVE CURRENT GLADIATOR BUTTON */}
            {currentProfile && (
              <button
                onClick={handleSaveToDrive}
                disabled={isLoading}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 hover:from-blue-500 hover:to-cyan-500 text-white font-serif font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(6,182,212,0.5)] border border-cyan-300 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
              >
                <UploadCloud className="w-5 h-5" />
                <span>Backup "{currentProfile.name}" to Google Drive</span>
              </button>
            )}

            {/* CLOUD SAVES LIST */}
            <div>
              <h4 className="font-serif font-bold text-xs uppercase tracking-wider text-amber-300 mb-2 flex items-center justify-between">
                <span>Available Drive Backups ({saves.length})</span>
                <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
              </h4>

              {saves.length === 0 ? (
                <div className="p-6 rounded-2xl bg-neutral-950 border border-neutral-800 text-center text-xs text-neutral-400">
                  No previous Sand &amp; Steel saves found on your Google Drive. Click backup above to create one.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {saves.map((file) => (
                    <div
                      key={file.id}
                      className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 hover:border-amber-600/50 flex justify-between items-center transition-all"
                    >
                      <div>
                        <div className="font-serif font-bold text-xs text-amber-100 flex items-center gap-2">
                          <span>{file.profilePreview?.name || file.name}</span>
                          {file.profilePreview && (
                            <span className="text-[10px] font-mono text-amber-400 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-700/50">
                              LVL {file.profilePreview.level} • Tier {file.profilePreview.tier}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-neutral-400 mt-0.5">
                          Saved: {new Date(file.modifiedTime).toLocaleString()}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleLoadFromDrive(file.id)}
                          disabled={isLoading}
                          className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-neutral-950 font-serif font-bold text-xs uppercase cursor-pointer flex items-center gap-1 active:scale-95"
                          title="Restore this save"
                        >
                          <DownloadCloud className="w-3.5 h-3.5" />
                          <span>Load</span>
                        </button>

                        <button
                          onClick={() => setDeleteConfirmId(file.id)}
                          className="p-2 rounded-xl bg-neutral-900 hover:bg-red-950/60 border border-neutral-800 hover:border-red-600 text-neutral-400 hover:text-red-400 cursor-pointer"
                          title="Delete cloud backup"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* DELETION CONFIRMATION DIALOG */}
        {deleteConfirmId && (
          <div className="fixed inset-0 bg-neutral-950/90 z-50 flex items-center justify-center p-4">
            <div className="bg-neutral-900 border-2 border-red-500 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center">
              <div className="w-12 h-12 rounded-full bg-red-900/50 border border-red-500 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <h4 className="font-serif font-bold text-base text-red-300 uppercase mb-2">
                Delete Google Drive Save?
              </h4>
              <p className="text-xs text-neutral-300 mb-5">
                Are you sure you want to delete this game save file from your Google Drive? This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 py-2.5 rounded-xl bg-neutral-800 text-neutral-300 text-xs font-bold font-serif cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteConfirm(deleteConfirmId)}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold font-serif cursor-pointer active:scale-95"
                >
                  Delete Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
