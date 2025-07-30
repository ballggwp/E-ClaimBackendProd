// src/controllers/userController.ts
import type { RequestHandler } from 'express'
import prisma from '../lib/prisma'
import { fetchAzureToken } from "./authController"; 
import axios from 'axios';

export const listUsers: RequestHandler = async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { 
        id: true,
        name: true,
        email: true,
        role: true,
        position: true,
        employeeNumber: true,
        department: true, // include department
      },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
}
export const listApprovers: RequestHandler = async (req, res, next) => {
  try {
    const azureToken = await fetchAzureToken();
    // replace YOUR_APPROVE_CODE with whatever you need (e.g. from env)
    const body = { approveCode: "206" };

    const profileRes = await axios.post(
      `https://${process.env.SERVICE_HOST}/userinfo/api/v2/profile`,
      body,
      {
        headers: {
          Authorization: `Bearer ${azureToken}`,
          "Ocp-Apim-Subscription-Key": process.env.AZURE_SUBSCRIPTION_KEY!,
          "Content-Type": "application/json",
        },
      }
    );

    const result = profileRes.data.result as any[];
    const users = result.map(u => ({
      id:       u.id,                        // e.g. "00000009"
      name:     u.employeeName.th,           // ไทยชื่อ
      position: u.position.name.th,  
      department : u.department.name.th        // ตำแหน่งไทย       // or derive from u.role if you have it
    }));

    res.json({ users });
  } catch (err) {
    console.error("listApprovers error:", err);
    next(err);
  }
};


