import { type QueryResult } from "../lib/commands";

interface ResultTableProps {
  result: QueryResult;
}

export default function ResultTable({ result }: ResultTableProps) {
  if (!result || result.columns.length === 0) {
    return (
      <div className="p-4 text-center text-gray-400">
        无数据返回
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-gray-900/95 sticky top-0 backdrop-blur-sm z-10 shadow-sm">
          <tr>
            {result.columns.map((column, index) => (
              <th
                key={index}
                className="px-4 py-3 text-left border-b border-gray-800/80 font-semibold text-gray-200 uppercase text-xs tracking-wider"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.length === 0 ? (
            <tr>
              <td
                colSpan={result.columns.length}
                className="px-4 py-12 text-center text-gray-400"
              >
                <div className="flex flex-col items-center gap-2">
                  <span className="text-3xl opacity-50">📭</span>
                  <span className="font-medium">无数据</span>
                </div>
              </td>
            </tr>
          ) : (
            result.rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors duration-150 group"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="px-4 py-2.5 text-gray-300 max-w-xs truncate group-hover:text-gray-200"
                    title={String(cell ?? "")}
                  >
                    {cell === null || cell === undefined
                      ? (
                        <span className="text-gray-500 italic font-mono text-xs">NULL</span>
                      )
                      : typeof cell === "object"
                      ? <span className="font-mono text-xs text-gray-400">{JSON.stringify(cell)}</span>
                      : <span className="font-mono text-xs">{String(cell)}</span>}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

