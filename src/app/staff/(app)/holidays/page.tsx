import { cols } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { today } from "@/lib/data";
import { usDate, weekday, WEEKDAY_NAMES } from "@/lib/sheet";
import { addHolidayAction, removeHolidayAction } from "@/actions/admin";
import { ActionForm, Field, Submit } from "@/components/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Holidays" };

export default async function Holidays() {
  const staff = await requireStaff();
  const from = `${today().slice(0, 4)}-01-01`;
  const list = await (await cols()).holidays.find({ _id: { $gte: from } }).sort({ _id: 1 }).toArray();
  const admin = staff.role === "ADMIN";
  return (
    <main className="wrap narrow">
      <h1>Holidays</h1>
      <p className="lead">A holiday shows on every student&apos;s sheet across the time columns, like “Holiday” written on the paper. Nobody can start or fill that day.</p>
      {admin && (
        <ActionForm action={addHolidayAction} className="panel">
          <div className="grid2"><Field name="date" label="Date" type="date" required /><Field name="name" label="Name" placeholder="Labor Day" /></div>
          <Submit>Add holiday</Submit>
        </ActionForm>
      )}
      <table className="tbl">
        <thead><tr><th>Date</th><th>Holiday</th>{admin && <th></th>}</tr></thead>
        <tbody>
          {list.map((h) => (
            <tr key={h._id}>
              <td>{WEEKDAY_NAMES[weekday(h._id)]}, {usDate(h._id)}</td><td>{h.name}</td>
              {admin && <td><ActionForm action={removeHolidayAction.bind(null, h._id)} confirm={`Remove ${h.name}?`}><Submit className="btn ghost">Remove</Submit></ActionForm></td>}
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={3} className="muted">No holidays this year yet.</td></tr>}
        </tbody>
      </table>
    </main>
  );
}
