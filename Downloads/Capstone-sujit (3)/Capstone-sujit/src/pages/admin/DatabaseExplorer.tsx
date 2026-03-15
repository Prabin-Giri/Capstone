import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    getDbTables,
    getTableData,
    adminInsertRow,
    adminUpdateRow,
    adminDeleteRow,
    type TableData,
    type TableColumn,
} from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Plus, RefreshCw, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import './DatabaseExplorer.css';

function isPk(col: TableColumn): boolean {
    return (col.COLUMN_KEY || col.pk) === 'PRI' || col.pk === 1;
}

function isAutoIncrement(col: TableColumn): boolean {
    const extra = (col.EXTRA || '').toString().toLowerCase();
    return extra.includes('auto_increment');
}

const DatabaseExplorer: React.FC = () => {
    const [tables, setTables] = useState<string[]>([]);
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [tableData, setTableData] = useState<TableData | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionError, setActionError] = useState<string | null>(null);
    const [modal, setModal] = useState<'add' | 'edit' | 'delete' | null>(null);
    const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
    const [deleteRow, setDeleteRow] = useState<Record<string, unknown> | null>(null);
    const [formRow, setFormRow] = useState<Record<string, unknown>>({});
    const [submitting, setSubmitting] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        loadTables();
    }, []);

    const loadTables = async () => {
        try {
            const data = await getDbTables();
            setTables(data);
            if (data.length > 0 && !selectedTable) {
                handleTableSelect(data[0]);
            }
        } catch (err) {
            console.error('Failed to load tables', err);
        } finally {
            setLoading(false);
        }
    };

    const refreshTable = () => {
        if (selectedTable) handleTableSelect(selectedTable);
    };

    const handleTableSelect = async (tableName: string) => {
        setSelectedTable(tableName);
        setLoading(true);
        setActionError(null);
        setModal(null);
        try {
            const data = await getTableData(tableName);
            setTableData(data);
        } catch (err) {
            console.error('Failed to load table data', err);
            setActionError('Failed to load table');
        } finally {
            setLoading(false);
        }
    };

    const openAddModal = () => {
        if (!tableData) return;
        const initial: Record<string, unknown> = {};
        tableData.columns.forEach(col => {
            if (isAutoIncrement(col)) return;
            initial[col.name] = '';
        });
        setFormRow(initial);
        setModal('add');
        setActionError(null);
    };

    const openEditModal = (row: Record<string, unknown>) => {
        setEditRow(row);
        setFormRow({ ...row });
        setModal('edit');
        setActionError(null);
    };

    const openDeleteModal = (row: Record<string, unknown>) => {
        setDeleteRow(row);
        setModal('delete');
        setActionError(null);
    };

    const closeModal = () => {
        setModal(null);
        setEditRow(null);
        setDeleteRow(null);
        setFormRow({});
        setActionError(null);
    };

    const getPrimaryKey = (row: Record<string, unknown>) => {
        if (!tableData) return {};
        const pk: Record<string, unknown> = {};
        tableData.columns.forEach(col => {
            if (isPk(col) && col.name in row) pk[col.name] = row[col.name];
        });
        return pk;
    };

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTable || !tableData) return;
        setSubmitting(true);
        setActionError(null);
        try {
            await adminInsertRow(selectedTable, formRow);
            closeModal();
            refreshTable();
        } catch (err: unknown) {
            setActionError(err instanceof Error ? err.message : 'Insert failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTable || !tableData || !editRow) return;
        const primaryKey = getPrimaryKey(editRow);
        const updates: Record<string, unknown> = {};
        tableData.columns.forEach(col => {
            if (isPk(col)) return;
            if (col.name in formRow) updates[col.name] = formRow[col.name];
        });
        setSubmitting(true);
        setActionError(null);
        try {
            await adminUpdateRow(selectedTable, primaryKey, updates);
            closeModal();
            refreshTable();
        } catch (err: unknown) {
            setActionError(err instanceof Error ? err.message : 'Update failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!selectedTable || !deleteRow) return;
        const primaryKey = getPrimaryKey(deleteRow);
        setSubmitting(true);
        setActionError(null);
        try {
            await adminDeleteRow(selectedTable, primaryKey);
            closeModal();
            refreshTable();
        } catch (err: unknown) {
            setActionError(err instanceof Error ? err.message : 'Delete failed');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading && tables.length === 0) return <div className="db-explorer">Loading database...</div>;

    return (
        <div className="db-explorer">
            <div className="db-sidebar">
                <div className="admin-functions">
                    <Button variant="ghost" size="sm" onClick={() => navigate('/admin')} style={{ width: '100%', justifyContent: 'flex-start' }}>
                        <ArrowLeft size={18} /> Back
                    </Button>
                </div>

                <div className="db-sidebar-tables-wrap">
                    <h2 className="sidebar-title">Tables</h2>
                    <div className="table-list" role="list">
                        {tables.map(table => (
                            <button
                                key={table}
                                type="button"
                                className={`table-btn ${selectedTable === table ? 'active' : ''}`}
                                onClick={() => handleTableSelect(table)}
                            >
                                {table}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="db-content">
                {tableData ? (
                    <div className="table-view">
                        <div className="table-header db-header-actions">
                            <div>
                                <h1>{tableData.tableName}</h1>
                                <p className="row-count">{tableData.rows.length} rows (max 500)</p>
                            </div>
                            <div className="db-toolbar">
                                <Button variant="outline" size="sm" onClick={refreshTable}>
                                    <RefreshCw size={16} />
                                    Refresh
                                </Button>
                                <Button variant="primary" size="sm" onClick={openAddModal}>
                                    <Plus size={16} />
                                    Add Row
                                </Button>
                            </div>
                        </div>

                        {actionError && (
                            <div className="db-error-banner">
                                {actionError}
                            </div>
                        )}

                        <Card className="table-card">
                            <div className="table-wrapper">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            {tableData.columns.map(col => (
                                                <th key={col.name}>
                                                    <div className="col-header">
                                                        <span className="col-name">{col.name}</span>
                                                        <span className="col-type">{col.type}</span>
                                                        {isPk(col) && <span className="pk-badge">PK</span>}
                                                    </div>
                                                </th>
                                            ))}
                                            <th className="col-actions">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tableData.rows.map((row, i) => (
                                            <tr key={i}>
                                                {tableData.columns.map(col => (
                                                    <td key={col.name}>
                                                        {row[col.name] === null ? (
                                                            <span className="null-value">NULL</span>
                                                        ) : (
                                                            String(row[col.name])
                                                        )}
                                                    </td>
                                                ))}
                                                <td className="col-actions">
                                                    <button
                                                        type="button"
                                                        className="db-row-btn db-edit-btn"
                                                        onClick={() => openEditModal(row)}
                                                        title="Edit row"
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="db-row-btn db-delete-btn"
                                                        onClick={() => openDeleteModal(row)}
                                                        title="Delete row"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                ) : (
                    <div className="db-empty">
                        <p>Select a table to view data</p>
                    </div>
                )}
            </div>

            {/* Add Row Modal */}
            {modal === 'add' && tableData && (
                <div className="db-modal-overlay" onClick={closeModal}>
                    <div className="db-modal" onClick={e => e.stopPropagation()}>
                        <h3 className="db-modal-title">Add row to {tableData.tableName}</h3>
                        <form onSubmit={handleAddSubmit} className="db-form">
                            {tableData.columns.filter(col => !isAutoIncrement(col)).map(col => (
                                <label key={col.name} className="db-form-group">
                                    <span className="db-form-label">{col.name}</span>
                                    <input
                                        type="text"
                                        className="db-form-input"
                                        value={formRow[col.name] != null ? String(formRow[col.name]) : ''}
                                        onChange={e => setFormRow(prev => ({ ...prev, [col.name]: e.target.value }))}
                                        placeholder={col.IS_NULLABLE === 'YES' ? 'NULL' : ''}
                                    />
                                </label>
                            ))}
                            {actionError && <p className="db-form-error">{actionError}</p>}
                            <div className="db-modal-actions">
                                <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
                                <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Insert'}</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Row Modal */}
            {modal === 'edit' && tableData && editRow && (
                <div className="db-modal-overlay" onClick={closeModal}>
                    <div className="db-modal" onClick={e => e.stopPropagation()}>
                        <h3 className="db-modal-title">Edit row in {tableData.tableName}</h3>
                        <form onSubmit={handleEditSubmit} className="db-form">
                            {tableData.columns.map(col => (
                                <label key={col.name} className="db-form-group">
                                    <span className="db-form-label">{col.name} {isPk(col) && '(PK)'}</span>
                                    <input
                                        type="text"
                                        className="db-form-input"
                                        readOnly={isPk(col)}
                                        value={formRow[col.name] != null ? String(formRow[col.name]) : ''}
                                        onChange={e => !isPk(col) && setFormRow(prev => ({ ...prev, [col.name]: e.target.value }))}
                                    />
                                </label>
                            ))}
                            {actionError && <p className="db-form-error">{actionError}</p>}
                            <div className="db-modal-actions">
                                <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
                                <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Update'}</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {modal === 'delete' && tableData && deleteRow && (
                <div className="db-modal-overlay" onClick={closeModal}>
                    <div className="db-modal db-modal-sm" onClick={e => e.stopPropagation()}>
                        <h3 className="db-modal-title">Delete row?</h3>
                        <p className="db-delete-preview">
                            {tableData.columns.map(col => (
                                <span key={col.name} className="db-delete-kv">
                                    <strong>{col.name}:</strong> {deleteRow[col.name] == null ? 'NULL' : String(deleteRow[col.name])}
                                </span>
                            ))}
                        </p>
                        {actionError && <p className="db-form-error">{actionError}</p>}
                        <div className="db-modal-actions">
                            <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
                            <Button variant="primary" onClick={handleDeleteConfirm} disabled={submitting}>
                                {submitting ? 'Deleting...' : 'Delete'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DatabaseExplorer;
