import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDbTables, getTableData, updateTableRecord, deleteTableRecord } from '../../lib/api';
import type { TableData } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { ChevronLeft, Edit2, Save, X, Trash2 } from 'lucide-react';
import './DatabaseExplorer.css';

const DatabaseExplorer: React.FC = () => {
    const [tables, setTables] = useState<string[]>([]);
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [tableData, setTableData] = useState<TableData | null>(null);
    const [loading, setLoading] = useState(true);
    const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
    const [editedData, setEditedData] = useState<Record<string, any>>({});

    useEffect(() => {
        loadTables();
    }, []);

    const loadTables = async () => {
        try {
            const data = await getDbTables();
            setTables(data);
            if (data.length > 0) {
                handleTableSelect(data[0]);
            }
        } catch (err) {
            console.error('Failed to load tables', err);
        } finally {
            setLoading(false);
        }
    };

    const handleTableSelect = async (tableName: string) => {
        setSelectedTable(tableName);
        setEditingRowIndex(null);
        setLoading(true);
        try {
            const data = await getTableData(tableName);
            setTableData(data);
        } catch (err) {
            console.error('Failed to load table data', err);
        } finally {
            setLoading(false);
        }
    };

    const startEditing = (index: number, row: any) => {
        setEditingRowIndex(index);
        setEditedData({ ...row });
    };

    const cancelEditing = () => {
        setEditingRowIndex(null);
        setEditedData({});
    };

    const handleFieldChange = (column: string, value: any) => {
        setEditedData(prev => ({ ...prev, [column]: value }));
    };

    const saveChanges = async (originalRow: any) => {
        if (!selectedTable || !tableData) return;

        const pkCols = tableData.columns.filter(c => c.pk === 1 || c.COLUMN_KEY === 'PRI');
        if (pkCols.length === 0) {
            alert('Cannot update: No primary key defined for this table');
            return;
        }

        const pkFields: Record<string, any> = {};
        pkCols.forEach(c => {
            pkFields[c.name] = originalRow[c.name];
        });

        // Only send changed fields
        const updates: Record<string, any> = {};
        Object.keys(editedData).forEach(key => {
            if (editedData[key] !== originalRow[key]) {
                updates[key] = editedData[key];
            }
        });

        if (Object.keys(updates).length === 0) {
            setEditingRowIndex(null);
            return;
        }

        try {
            await updateTableRecord(selectedTable, pkFields, updates);
            await handleTableSelect(selectedTable);
        } catch (err: any) {
            alert(err.message || 'Failed to update record');
        }
    };

    const handleDeleteRow = async (row: any) => {
        if (!selectedTable || !tableData) return;
        if (!window.confirm('Are you sure you want to delete this record?')) return;

        const pkCols = tableData.columns.filter(c => c.pk === 1 || c.COLUMN_KEY === 'PRI');
        if (pkCols.length === 0) {
            alert('Cannot delete: No primary key defined for this table');
            return;
        }

        const pkFields: Record<string, any> = {};
        pkCols.forEach(c => {
            pkFields[c.name] = row[c.name];
        });

        try {
            await deleteTableRecord(selectedTable, pkFields);
            await handleTableSelect(selectedTable);
        } catch (err: any) {
            alert(err.message || 'Failed to delete record');
        }
    };

    if (loading && tables.length === 0) return <div className="db-explorer">Loading database...</div>;

    return (
        <div className="db-explorer">
            <div className="db-sidebar">
                <Link
                    to="/admin"
                    className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 mb-3"
                >
                    <ChevronLeft size={18} /> Back
                </Link>
                <h2 className="sidebar-title">Tables</h2>
                <div className="table-list">
                    {tables.map(table => (
                        <button
                            key={table}
                            className={`table-btn ${selectedTable === table ? 'active' : ''}`}
                            onClick={() => handleTableSelect(table)}
                        >
                            {table}
                        </button>
                    ))}
                </div>
            </div>

            <div className="db-content">
                {tableData ? (
                    <div className="table-view">
                        <div className="table-header">
                            <h1>{tableData.tableName}</h1>
                            <p className="row-count">{tableData.rows.length} rows (showing first 100)</p>
                        </div>

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
                                                                    {col.pk === 1 && <span className="pk-badge">PK</span>}
                                                    </div>
                                                </th>
                                            ))}
                                            <th style={{ width: '80px' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tableData.rows.map((row, i) => (
                                            <tr key={i} className={editingRowIndex === i ? 'editing-row' : ''}>
                                                {tableData.columns.map(col => (
                                                    <td key={col.name}>
                                                        {editingRowIndex === i ? (
                                                            <input
                                                                type="text"
                                                                className="db-edit-input"
                                                                value={editedData[col.name] === null ? '' : editedData[col.name]}
                                                                onChange={e => handleFieldChange(col.name, e.target.value)}
                                                                autoFocus={tableData.columns.indexOf(col) === 0}
                                                            />
                                                        ) : (
                                                            row[col.name] === null ? (
                                                                <span className="null-value">NULL</span>
                                                            ) : (
                                                                String(row[col.name])
                                                            )
                                                        )}
                                                    </td>
                                                ))}
                                                <td className="actions-cell">
                                                    {editingRowIndex === i ? (
                                                        <div className="flex gap-2">
                                                            <button onClick={() => saveChanges(row)} className="text-emerald-400 hover:text-emerald-300" title="Save">
                                                                <Save size={18} />
                                                            </button>
                                                            <button onClick={cancelEditing} className="text-slate-400 hover:text-slate-200" title="Cancel">
                                                                <X size={18} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex gap-2">
                                                            <button onClick={() => startEditing(i, row)} className="text-slate-400 hover:text-sky-400" title="Edit">
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button onClick={() => handleDeleteRow(row)} className="text-slate-400 hover:text-red-400" title="Delete">
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    )}
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
        </div>
    );
};

export default DatabaseExplorer;
