import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDbTables, getTableData } from '../../lib/api';
import type { TableData } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { ChevronLeft } from 'lucide-react';
import './DatabaseExplorer.css';

const DatabaseExplorer: React.FC = () => {
    const [tables, setTables] = useState<string[]>([]);
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [tableData, setTableData] = useState<TableData | null>(null);
    const [loading, setLoading] = useState(true);

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
