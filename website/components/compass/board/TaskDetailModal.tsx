'use client';

// Task detail/edit modal — ported from app/index.html's #detailModal plus
// openDetailModal()/detailSaveBtn/detailDeleteBtn's click handlers. Built
// on the shared Modal shell (components/compass/shared/Modal.tsx) rather
// than a bespoke overlay. Remove/Restore and the Undo-toast side effect are
// owned by BoardTab.tsx (it also owns closing the modal after any of
// Save/Remove/Restore) — this component only decides WHICH action to fire
// based on `task.deleted`, matching vanilla's single detailDeleteBtn
// listener branching on `t.deleted`.
import { useEffect, useState } from 'react';
import Modal from '../shared/Modal';
import type { Task, TaskPriority, TaskStatus, TaskType } from '../types';

export default function TaskDetailModal({
  open,
  task,
  onClose,
  onSave,
  onRemove,
  onRestore,
}: {
  open: boolean;
  task: Task | null;
  onClose: () => void;
  onSave: (id: string, patch: Partial<Omit<Task, 'id'>>) => void;
  onRemove: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const [item, setItem] = useState('');
  const [type, setType] = useState<TaskType>('Task');
  const [priority, setPriority] = useState<TaskPriority>('Medium');
  const [related, setRelated] = useState('');
  const [due, setDue] = useState('');
  const [status, setStatus] = useState<TaskStatus>('Open');
  const [notes, setNotes] = useState('');

  // Reload local edit fields fresh from the task every time a (possibly
  // different) task is opened — mirrors vanilla's openDetailModal()
  // populating every #detail* field from `t` on each open.
  useEffect(() => {
    if (!task) return;
    setItem(task.item || '');
    setType(task.type || 'Task');
    setPriority(task.priority || 'Medium');
    setRelated(task.related || '');
    setDue(task.due || '');
    setStatus(task.status || 'Open');
    setNotes(task.notes || '');
  }, [task]);

  if (!task) return null;

  const sourceInfo = task.sourceNoteTitle
    ? `From note: ${task.sourceNoteTitle}`
    : task.manual
      ? 'Added manually on the Board'
      : '';

  function handleSave() {
    if (!task) return;
    onSave(task.id, {
      item: item.trim() || task.item,
      type,
      priority,
      related: related.trim() || null,
      due: due.trim() || null,
      status,
      notes: notes.trim() || null,
    });
  }

  function handleRemoveOrRestore() {
    if (!task) return;
    if (task.deleted) {
      onRestore(task.id);
    } else {
      onRemove(task.id);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={task.deleted ? 'Task details (in trash)' : 'Task details'}>
      <label className="ch-label">Item</label>
      <textarea className="ch-field ch-detail-textarea" value={item} onChange={(e) => setItem(e.target.value)} />

      <div className="ch-detail-field-row">
        <div>
          <label className="ch-label">Type</label>
          <select className="ch-field" value={type} onChange={(e) => setType(e.target.value as TaskType)}>
            <option value="Task">Task</option>
            <option value="Follow-up">Follow-up</option>
          </select>
        </div>
        <div>
          <label className="ch-label">Priority</label>
          <select className="ch-field" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
      </div>

      <div className="ch-detail-field-row">
        <div>
          <label className="ch-label">Related to (person/team)</label>
          <input type="text" className="ch-field" value={related} onChange={(e) => setRelated(e.target.value)} />
        </div>
        <div>
          <label className="ch-label">Due date</label>
          <input type="date" className="ch-field" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>

      <label className="ch-label">Status</label>
      <select className="ch-field" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
        <option value="Open">Open</option>
        <option value="In Progress">In Progress</option>
        <option value="Waiting on Others">Waiting on Others</option>
        <option value="Done">Done</option>
      </select>

      <label className="ch-label">Notes</label>
      <textarea className="ch-field ch-detail-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {sourceInfo ? <div className="ch-detail-source-info">{sourceInfo}</div> : null}

      <div className="ch-detail-modal-actions">
        <button type="button" className="ch-btn ch-btn-danger" onClick={handleRemoveOrRestore}>
          {task.deleted ? 'Restore' : 'Remove'}
        </button>
        <div className="ch-detail-modal-actions-right">
          <button type="button" className="ch-btn ch-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="ch-btn ch-btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
