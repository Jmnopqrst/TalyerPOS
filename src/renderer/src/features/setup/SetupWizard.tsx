import { CheckCircle2, Circle, PackagePlus, ReceiptText, Settings, UserPlus, Wrench } from "lucide-react";
import { Badge } from "../../../components/Badge";
import type { AppData } from "../../../types/global";

interface SetupStep {
  key: string;
  title: string;
  detail: string;
  done: boolean;
  module: "settings" | "services" | "inventory" | "suppliers" | "users";
}

export function buildSetupSteps(data: AppData): SetupStep[] {
  const defaultReceipt = data.receiptSettings.business_name === "TalyerPOS" || data.receiptSettings.contact_number === "09170000000";
  return [
    {
      key: "business",
      title: "Business and receipt details",
      detail: "Set shop name, contact details, logo, receipt layout, and printer/PDF output.",
      done: !defaultReceipt,
      module: "settings"
    },
    {
      key: "payments",
      title: "Payment methods",
      detail: "Confirm cash and digital payment methods before checkout.",
      done: data.paymentMethods.some((method) => method.status === "Active"),
      module: "settings"
    },
    {
      key: "services",
      title: "Service catalog",
      detail: "Add repair services, prices, labor cost, and estimated duration.",
      done: data.services.length > 0,
      module: "services"
    },
    {
      key: "suppliers",
      title: "Suppliers",
      detail: "Add vendors so inventory stock-in and purchase orders are traceable.",
      done: data.suppliers.length > 0,
      module: "suppliers"
    },
    {
      key: "inventory",
      title: "Inventory categories and parts",
      detail: "Create categories and add starting parts, stock counts, and selling prices.",
      done: data.inventoryCategories.length > 0 && data.inventory.length > 0,
      module: "inventory"
    },
    {
      key: "users",
      title: "Staff accounts",
      detail: "Create accounts for admins and cashiers who will use the system.",
      done: data.users.filter((user) => user.status === "Active" && user.role !== "Owner").length > 0,
      module: "users"
    }
  ];
}

export function SetupWizard({
  data,
  onOpenModule,
  onDismiss
}: {
  data: AppData;
  onOpenModule: (module: SetupStep["module"]) => void;
  onDismiss: () => void;
}) {
  const steps = buildSetupSteps(data);
  const completed = steps.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.done);

  return (
    <section className="panel setup-wizard">
      <div className="panel-head">
        <div>
          <h2>First-run setup</h2>
          <p className="empty-state">Finish these setup tasks before running daily shop transactions.</p>
        </div>
        <Badge tone={completed === steps.length ? "good" : "warn"}>{`${completed}/${steps.length} done`}</Badge>
      </div>
      <div className="setup-step-grid">
        {steps.map((step) => (
          <button className={step.done ? "setup-step done" : "setup-step"} key={step.key} onClick={() => onOpenModule(step.module)}>
            {step.done ? <CheckCircle2 size={19} /> : step.key === "business" ? <ReceiptText size={19} /> : step.key === "inventory" ? <PackagePlus size={19} /> : step.key === "users" ? <UserPlus size={19} /> : step.key === "services" ? <Wrench size={19} /> : step.key === "payments" ? <Settings size={19} /> : <Circle size={19} />}
            <span>
              <strong>{step.title}</strong>
              <small>{step.detail}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="table-actions">
        {nextStep && <button className="primary-button compact-button" onClick={() => onOpenModule(nextStep.module)}>Continue Setup</button>}
        <button className="secondary-button compact-button" onClick={onDismiss}>Hide Setup</button>
      </div>
    </section>
  );
}
