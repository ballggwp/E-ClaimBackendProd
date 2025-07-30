// src/controllers/reportController.ts
import { RequestHandler } from "express";
import { PrismaClient, ClaimStatus } from "@prisma/client";
import ExcelJS from "exceljs";

const prisma = new PrismaClient();

export const generateMonthlyReportCPM: RequestHandler = async (req, res, next) => {
  try {
    // pull everything as strings (either month/year or from/to)
    const {
      month,       year,
      fromMonth,   fromYear,
      toMonth,     toYear
    } = req.query as Record<string, string | undefined>;

    // fallback: if they gave only month/year, use that as from/to
    const fm = Number(fromMonth ?? month);
    const fy = Number(fromYear ?? year);
    const tm = Number(toMonth ?? month);
    const ty = Number(toYear ?? year);

    // all four must parse to numbers, and months must be 1–12
    if (
      [fm, fy, tm, ty].some(n => isNaN(n)) ||
      fm < 1 || fm > 12 ||
      tm < 1 || tm > 12
    ) {
      res
        .status(400)
        .json({ error: "Invalid or missing `month`/`year` or `from/to` parameters" });
      return;
    }

    // build date window
    const startDate = new Date(fy, fm - 1, 1);
    // endDate is *start* of the month after (so range is [startDate, endDate) )
    const endDate = new Date(ty, tm, 1);

    // fetch all COMPLETED CPM claims whose COMPLETED event falls in that window
    const records = await prisma.claim.findMany({
      where: {
        
        history: {
          some: {
            
            createdAt: { gte: startDate, lt: endDate },
          },
        },
      },
      select: {
        docNum:        true,
        createdByName: true,
        createdAt:     true,
        history: {
          where: {
            status: { in: [ClaimStatus.PENDING_USER_CONFIRM, ClaimStatus.COMPLETED] }
          },
          select: { status: true, createdAt: true }
        },
        fppa04Base: {
          select: {
            cpmVariant: {
              select: {
                company:   true,
                factory:   true,
                netAmount: true,
              }
            }
          }
        },
        status: true,
      }
    });

    // build the Excel workbook
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("CPM Report");

    ws.addRow([
      "Doc Num",
      "Created By",
      "Created Date",
      "Manager Approved At",
      "Completed At",
      "Days to Complete",
      "Company",
      "Factory",
      "Net Amount",
      "Final Status"
    ]);

    for (const c of records) {
      const createdDate = c.createdAt;
      const mgrHist     = c.history.find(h => h.status === ClaimStatus.PENDING_USER_CONFIRM);
      const compHist    = c.history.find(h => h.status === ClaimStatus.COMPLETED);
      const mgrAt       = mgrHist?.createdAt;
      const compAt      = compHist?.createdAt;
      const days        = (mgrAt && compAt)
        ? Math.floor((compAt.getTime() - mgrAt.getTime()) / (1000 * 60 * 60 * 24))
        : "";

      const cpm = c.fppa04Base?.cpmVariant;
      ws.addRow([
        c.docNum,
        c.createdByName,
        createdDate.toISOString().slice(0, 10),
        mgrAt   ? mgrAt.toISOString().slice(0, 10) : "",
        compAt  ? compAt.toISOString().slice(0, 10) : "",
        days,
        cpm?.company   || "",
        cpm?.factory   || "",
        cpm?.netAmount || "",
        c.status
      ]);
    }

    // determine file name - check if it's a range request or single month
    const isRangeRequest = fromMonth && fromYear && toMonth && toYear;
    const fileName = isRangeRequest
      ? `cpm-report-${fy}-${String(fm).padStart(2, '0')}-to-${ty}-${String(tm).padStart(2, '0')}.xlsx`
      : `cpm-report-${year}-${String(month).padStart(2, '0')}.xlsx`;

    res
      .setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
      .setHeader(
        "Content-Disposition",
        `attachment; filename=${fileName}`
      );

    await wb.xlsx.write(res);
    res.end();

  } catch (err) {
    next(err);
  }
};