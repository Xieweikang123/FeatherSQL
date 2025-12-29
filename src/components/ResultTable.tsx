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
        <thead className="bg-gray-800 sticky top-0">
          <tr>
            {result.columns.map((column, index) => (
              <th
                key={index}
                className="px-4 py-2 text-left border-b border-gray-700 font-medium text-gray-300"
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
                className="px-4 py-8 text-center text-gray-400"
              >
                无数据
              </td>
            </tr>
          ) : (
            result.rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-gray-700 hover:bg-gray-800/50"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="px-4 py-2 text-gray-300 max-w-xs truncate"
                    title={String(cell ?? "")}
                  >
                    {cell === null || cell === undefined
                      ? (
                        <span className="text-gray-500 italic">NULL</span>
                      )
                      : typeof cell === "object"
                      ? JSON.stringify(cell)
                      : String(cell)}
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

