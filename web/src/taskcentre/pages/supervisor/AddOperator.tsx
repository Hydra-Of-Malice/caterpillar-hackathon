/**
 * Add an operator to this supervisor's team (POST /tc/users with role `operator`).
 *
 * Site and supervisor come from the caller's session server-side, so the form only collects the
 * person's details. It validates client-side and shows the server's 4xx message verbatim.
 */
import { useState } from 'react';
import { auth } from '../../api';
import { TcError } from '../../components';
import { Button, Modal } from '../../../components/ui';
import type { User } from '../../types';
import { Field } from './common';

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

interface Errors {
  name?: string;
  username?: string;
  password?: string;
}

export function AddOperator({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (op?: User) => void }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [machine, setMachine] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<unknown>();
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName('');
    setUsername('');
    setPassword('');
    setMachine('');
    setErrors({});
    setServerError(undefined);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (!name.trim()) e.name = 'Enter the operator name.';
    else if (name.trim().length > 80) e.name = 'Keep the name under 80 characters.';
    if (!username.trim()) e.username = 'Enter a username.';
    else if (!USERNAME_RE.test(username.trim().toLowerCase())) e.username = 'Lower case letters, digits, dot, dash or underscore; 3 to 32 characters.';
    if (!password) e.password = 'Enter a first password.';
    else if (password.length < 6) e.password = 'Use at least 6 characters.';
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e);
    setServerError(undefined);
    if (Object.keys(e).length > 0) return;
    setBusy(true);
    try {
      const created = await auth.createUser({
        name: name.trim(),
        username: username.trim().toLowerCase(),
        password,
        role: 'operator',
        machine_id: machine.trim() || null,
      });
      reset();
      onAdded(created);
      onClose();
    } catch (err) {
      setServerError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add operator"
      width="max-w-[560px]"
      footer={
        <>
          <Button onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon="person_add" onClick={submit} disabled={busy}>
            {busy ? 'Adding…' : 'Add operator'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-body-sm text-on-surface-muted">
          The new operator joins your team and signs in at the operator entry point. The API takes the site and the supervisor from your own session, and it
          is the API — not this form — that decides whether you may add them.
        </p>

        <Field label="Name" error={errors.name} hint="Shown on your team list and on their tasks.">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={80} />
        </Field>

        <Field label="Username" error={errors.username} hint="Used to sign in. Lower case, no spaces.">
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" spellCheck={false} maxLength={32} />
        </Field>

        <Field label="First password" error={errors.password} hint="Demo accounts only. Hand it over in person and ask them to change it.">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>

        <Field label="Machine (optional)" hint="Machine id such as EX-07. Leave blank if they are not on one yet.">
          <input className="input" value={machine} onChange={(e) => setMachine(e.target.value)} autoComplete="off" placeholder="EX-07" />
        </Field>

        {serverError !== undefined && <TcError error={serverError} what="The operator" />}
      </div>
    </Modal>
  );
}

export default AddOperator;
