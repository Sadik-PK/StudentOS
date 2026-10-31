import { FormEvent, useMemo, useState } from 'react';
import { AppState, CustomExpenseCategory, Expense, ExpenseCategory } from '../types';

interface Props { state: AppState; update: (p: Partial<AppState>) => void; }

interface CategoryMeta {
  key: ExpenseCategory;
  label: string;
  color: string;
  text: string;
}

const CATEGORIES: CategoryMeta[] = [
  { key: 'food', label: 'FOOD', color: '#e8a020', text: 'text-amber-400' },
  { key: 'transport', label: 'TRANSPORT', color: '#3b82f6', text: 'text-blue-400' },
  { key: 'study', label: 'STUDY', color: '#a78bfa', text: 'text-violet-400' },
  { key: 'housing', label: 'HOUSING', color: '#1ea854', text: 'text-green-500' },
  { key: 'health', label: 'HEALTH', color: '#ef4444', text: 'text-red-500' },
  { key: 'entertainment', label: 'ENTERTAINMENT', color: '#ec4899', text: 'text-pink-500' },
  { key: 'other', label: 'OTHER', color: '#4e5e72', text: 'text-[#4e5e72]' },
];

const CUSTOM_COLORS = ['#22d3ee', '#f97316', '#84cc16', '#facc15', '#c084fc', '#14b8a6'];

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
}

export default function Expenses({ state, update }: Props) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [filter, setFilter] = useState<ExpenseCategory | 'all'>('all');
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  const expenses = state.expenses || [];
  const customCategories = state.customExpenseCategories || [];
  const allCategories: CategoryMeta[] = [
    ...CATEGORIES,
    ...customCategories.map((item, index) => ({
      key: item.id,
      label: item.label,
      color: CUSTOM_COLORS[index % CUSTOM_COLORS.length],
      text: 'text-cyan-400',
    })),
  ];
  const sortedExpenses = useMemo(
    () => [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [expenses],
  );
  const visibleExpenses = filter === 'all'
    ? sortedExpenses
    : sortedExpenses.filter(expense => expense.category === filter);

  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyTotal = expenses
    .filter(expense => expense.date.startsWith(currentMonth))
    .reduce((sum, expense) => sum + expense.amount, 0);

  const categoryTotals = allCategories.map(item => ({
    ...item,
    total: expenses
      .filter(expense => expense.category === item.key)
      .reduce((sum, expense) => sum + expense.amount, 0),
  })).filter(item => item.total > 0);

  const topCategory = [...categoryTotals].sort((a, b) => b.total - a.total)[0];
  let angle = 0;
  const pieSegments = categoryTotals.map(item => {
    const start = angle;
    angle += (item.total / total) * 360;
    return `${item.color} ${start}deg ${angle}deg`;
  });
  const pieBackground = total > 0
    ? `conic-gradient(${pieSegments.join(', ')})`
    : '#19222e';

  function addExpense(event: FormEvent) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!description.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !date) return;

    const expense: Expense = {
      id: crypto.randomUUID(),
      description: description.trim(),
      amount: Math.round(parsedAmount * 100) / 100,
      category,
      date,
      createdAt: new Date().toISOString(),
    };
    update({ expenses: [expense, ...expenses] });
    setDescription('');
    setAmount('');
  }

  function deleteExpense(id: string) {
    update({ expenses: expenses.filter(expense => expense.id !== id) });
  }

  function addCategory() {
    const label = newCategory.trim().replace(/\s+/g, ' ').toUpperCase();
    if (!label || allCategories.some(item => item.label.toUpperCase() === label)) return;

    const item: CustomExpenseCategory = {
      id: `custom:${crypto.randomUUID()}`,
      label,
    };
    update({ customExpenseCategories: [...customCategories, item] });
    setCategory(item.id);
    setNewCategory('');
    setAddingCategory(false);
  }

  function getCategoryMeta(categoryId: ExpenseCategory) {
    return allCategories.find(item => item.key === categoryId) || CATEGORIES[CATEGORIES.length - 1];
  }

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 border border-[#19222e] bg-[#0d1219]">
        <Summary label="TOTAL OUTGOING" value={formatMoney(total)} tone="text-amber-400" />
        <Summary label="THIS MONTH" value={formatMoney(monthlyTotal)} tone="text-[#cdd5df]" />
        <Summary label="TRANSACTIONS" value={String(expenses.length).padStart(2, '0')} tone="text-[#cdd5df]" />
        <Summary label="TOP SECTOR" value={topCategory?.label || 'NONE'} tone={topCategory?.text || 'text-[#4e5e72]'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3 border border-[#19222e] bg-[#0d1219]">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#19222e]">
            <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── SPEND DISTRIBUTION</span>
            <span className="font-mono text-[10px] text-[#4e5e72]">ALL TIME</span>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-8 items-center min-h-72">
            <div className="relative w-52 h-52 mx-auto">
              <div
                className="absolute inset-0 rounded-full border border-[#222e40]"
                style={{ background: pieBackground }}
                role="img"
                aria-label="Expense distribution by category"
              />
              <div className="absolute inset-12 rounded-full bg-[#0d1219] border border-[#19222e] flex flex-col items-center justify-center text-center">
                <span className="font-mono text-[9px] text-[#4e5e72] tracking-wider">TOTAL</span>
                <span className="font-mono text-sm text-[#cdd5df] mt-1">{formatMoney(total)}</span>
              </div>
            </div>

            <div className="space-y-2">
              {categoryTotals.length === 0 ? (
                <div className="border-l-2 border-[#19222e] pl-3">
                  <p className="font-mono text-xs text-[#4e5e72]">NO EXPENSE DATA</p>
                  <p className="font-mono text-[10px] text-[#2a3548] mt-1">LOG A TRANSACTION TO INITIALIZE CHART</p>
                </div>
              ) : categoryTotals.map(item => {
                const percentage = Math.round((item.total / total) * 100);
                return (
                  <div key={item.key} className="grid grid-cols-[10px_1fr_auto] items-center gap-3 py-1.5 border-b border-[#19222e] last:border-b-0">
                    <span className="w-2 h-2" style={{ backgroundColor: item.color }} />
                    <div>
                      <p className="font-mono text-[10px] text-[#cdd5df]">{item.label}</p>
                      <p className="font-mono text-[9px] text-[#4e5e72]">{percentage}% OF TOTAL</p>
                    </div>
                    <span className="font-mono text-xs text-[#cdd5df]">{formatMoney(item.total)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <form onSubmit={addExpense} className="xl:col-span-2 border border-[#19222e] bg-[#0d1219] self-start">
          <div className="px-4 py-2 border-b border-[#19222e] flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── LOG EXPENSE</span>
            <span className="font-mono text-[10px] text-green-500">[READY]</span>
          </div>
          <div className="p-4 space-y-3">
            <label className="block">
              <span className="font-mono text-[10px] text-[#4e5e72] block mb-1">DESCRIPTION</span>
              <input
                value={description}
                onChange={event => setDescription(event.target.value)}
                placeholder="e.g. Mess bill"
                className="w-full px-2 py-2 text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="font-mono text-[10px] text-[#4e5e72] block mb-1">AMOUNT (INR)</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={event => setAmount(event.target.value)}
                  placeholder="0.00"
                  className="w-full px-2 py-2 text-sm font-mono"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] text-[#4e5e72] block mb-1">DATE</span>
                <input
                  type="date"
                  value={date}
                  onChange={event => setDate(event.target.value)}
                  className="w-full px-2 py-2 text-sm font-mono"
                />
              </label>
            </div>
            <label className="block">
              <span className="font-mono text-[10px] text-[#4e5e72] flex items-center justify-between mb-1">
                <span>CATEGORY</span>
                {!addingCategory && (
                  <button
                    type="button"
                    onClick={() => setAddingCategory(true)}
                    className="text-amber-400 hover:text-amber-300 transition-colors">
                    + NEW CATEGORY
                  </button>
                )}
              </span>
              <select
                value={category}
                onChange={event => setCategory(event.target.value as ExpenseCategory)}
                className="w-full px-2 py-2 text-sm font-mono">
                {allCategories.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
            {addingCategory && (
              <div className="flex">
                <input
                  autoFocus
                  value={newCategory}
                  onChange={event => setNewCategory(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addCategory();
                    }
                    if (event.key === 'Escape') {
                      setAddingCategory(false);
                      setNewCategory('');
                    }
                  }}
                  placeholder="Category name"
                  className="flex-1 min-w-0 px-2 py-2 text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={addCategory}
                  disabled={!newCategory.trim()}
                  className="px-3 font-mono text-[10px] border-y border-r border-amber-400 text-amber-400 hover:bg-amber-400 hover:text-[#090b0e] disabled:border-[#19222e] disabled:text-[#2a3548] transition-colors">
                  ADD
                </button>
                <button
                  type="button"
                  onClick={() => { setAddingCategory(false); setNewCategory(''); }}
                  className="px-3 font-mono text-[10px] border-y border-r border-[#19222e] text-[#4e5e72] hover:text-red-400 transition-colors">
                  CANCEL
                </button>
              </div>
            )}
          </div>
          <div className="px-4 py-3 border-t border-[#19222e]">
            <button
              type="submit"
              disabled={!description.trim() || Number(amount) <= 0 || !date}
              className="w-full py-2 font-mono text-xs font-semibold bg-amber-400 text-[#090b0e] hover:bg-amber-300 disabled:bg-[#19222e] disabled:text-[#4e5e72] transition-colors">
              + COMMIT TRANSACTION
            </button>
          </div>
        </form>
      </div>

      <div className="border border-[#19222e] bg-[#0d1219]">
        <div className="px-4 py-2 border-b border-[#19222e] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="font-mono text-[10px] tracking-widest text-[#4e5e72]">── TRANSACTION LEDGER</span>
          <div className="flex flex-wrap gap-1">
            <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>ALL</FilterButton>
            {allCategories.map(item => (
              <FilterButton key={item.key} active={filter === item.key} onClick={() => setFilter(item.key)}>
                {item.label}
              </FilterButton>
            ))}
          </div>
        </div>

        {visibleExpenses.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="font-mono text-xs text-[#4e5e72]">NO TRANSACTIONS FOUND</p>
          </div>
        ) : (
          <div className="divide-y divide-[#19222e]">
            {visibleExpenses.map(expense => {
              const meta = getCategoryMeta(expense.category);
              return (
                <div key={expense.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[110px_1fr_150px_120px_auto] items-center gap-3 px-4 py-3 hover:bg-[#111720] transition-colors group">
                  <span className="hidden sm:block font-mono text-[10px] text-[#4e5e72]">
                    {new Date(`${expense.date}T00:00:00`).toLocaleDateString('en-GB')}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-[#cdd5df] truncate">{expense.description}</p>
                    <p className="sm:hidden font-mono text-[9px] text-[#4e5e72]">{expense.date}</p>
                  </div>
                  <span className={`hidden sm:block font-mono text-[10px] ${meta.text}`}>[{meta.label}]</span>
                  <span className="font-mono text-sm text-amber-400 text-right">{formatMoney(expense.amount)}</span>
                  <button
                    onClick={() => deleteExpense(expense.id)}
                    className="font-mono text-[10px] text-[#2a3548] hover:text-red-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
                    DEL
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="p-4 border-r border-b xl:border-b-0 border-[#19222e] last:border-r-0">
      <p className="font-mono text-[9px] tracking-widest text-[#4e5e72]">{label}</p>
      <p className={`font-mono text-xl mt-2 truncate ${tone}`}>{value}</p>
    </div>
  );
}

function FilterButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`font-mono text-[9px] px-2 py-1 border transition-colors ${
        active
          ? 'border-amber-400 bg-amber-400 text-[#090b0e]'
          : 'border-[#19222e] text-[#4e5e72] hover:text-[#cdd5df]'
      }`}>
      {children}
    </button>
  );
}
