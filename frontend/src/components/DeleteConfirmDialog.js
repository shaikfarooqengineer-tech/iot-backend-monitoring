// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/components/DeleteConfirmDialog.js
// PURPOSE: Reusable confirmation dialog for destructive actions.
//          Uses shadcn AlertDialog. Shows user name and warns about permanence.
// ═══════════════════════════════════════════════════════════════════════════

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DeleteConfirmDialog({ open, onClose, onConfirm, userName, loading }) {
  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete user permanently?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete <strong>{userName}</strong> and remove all
            their sessions, devices, and data. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {loading ? "Deleting…" : "Delete permanently"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
