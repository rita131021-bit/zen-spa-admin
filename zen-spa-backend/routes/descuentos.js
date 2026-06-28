// routes/descuentos.js
module.exports = function createDescuentosRouter(db) {
  const express = require('express');
  const router = express.Router();

  // GET TODOS LOS DESCUENTOS
  router.get('/', (req, res) => {
    const sql = 'SELECT * FROM descuentos_fidelidad ORDER BY porcentaje DESC';
    db.query(sql, (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results || []);
    });
  });

  // GET DESCUENTOS ACTIVOS
  router.get('/activos/true', (req, res) => {
    const sql = 'SELECT * FROM descuentos_fidelidad WHERE activo = TRUE ORDER BY porcentaje DESC';
    db.query(sql, (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results || []);
    });
  });

  // RESUMEN DE FIDELIDAD POR CLIENTE
  router.get('/fidelidad/clientes', (req, res) => {
    const clientesSql = `
      SELECT
        c.id,
        c.nombre,
        c.whatsapp,
        c.telefono,
        COALESCE(SUM(CASE WHEN LOWER(t.estado) = 'completado' THEN 1 ELSE 0 END), 0)::int as visitas_completadas,
        MIN(CASE WHEN LOWER(t.estado) = 'completado' THEN t.fecha ELSE NULL END) as primera_visita,
        MAX(CASE WHEN LOWER(t.estado) = 'completado' THEN t.fecha ELSE NULL END) as ultima_visita
      FROM clientes c
      LEFT JOIN turnos t ON t.cliente_id = c.id
      GROUP BY c.id, c.nombre, c.whatsapp, c.telefono
      ORDER BY visitas_completadas DESC, c.nombre ASC
    `;

    db.query(clientesSql, (err, clientes) => {
      if (err) return res.status(500).json({ error: err.message });

      const descuentosSql = 'SELECT * FROM descuentos_fidelidad WHERE activo = TRUE ORDER BY turnos_requeridos ASC, porcentaje ASC';
      db.query(descuentosSql, (descErr, descuentos) => {
        if (descErr) return res.status(500).json({ error: descErr.message });

        const reglas = (descuentos || []).filter((d) => Number(d.turnos_requeridos) > 0);
        const resumen = (clientes || []).map((cliente) => {
          const visitas = Number(cliente.visitas_completadas || 0);
          const descuentoActual = reglas
            .filter((d) => Number(d.turnos_requeridos) <= visitas)
            .sort((a, b) => Number(b.porcentaje) - Number(a.porcentaje))[0] || null;
          const proximoDescuento = reglas
            .filter((d) => Number(d.turnos_requeridos) > visitas)
            .sort((a, b) => Number(a.turnos_requeridos) - Number(b.turnos_requeridos))[0] || null;

          return {
            ...cliente,
            visitas_completadas: visitas,
            checks: Array.from({ length: visitas }, (_, index) => index + 1),
            descuento_actual: descuentoActual,
            proximo_descuento: proximoDescuento,
            visitas_para_proximo: proximoDescuento ? Math.max(Number(proximoDescuento.turnos_requeridos) - visitas, 0) : 0,
          };
        });

        res.json(resumen);
      });
    });
  });

  // CALCULAR DESCUENTO PARA CLIENTE
  router.post('/cliente/:cliente_id', (req, res) => {
    const cliente_id = req.params.cliente_id;
    
    const sql = `
      SELECT 
        c.id,
        c.nombre,
        COUNT(t.id) as cantidad_turnos,
        (EXTRACT(YEAR FROM AGE(CURRENT_DATE, MIN(t.fecha))) * 12
          + EXTRACT(MONTH FROM AGE(CURRENT_DATE, MIN(t.fecha))))::int as meses_cliente
      FROM clientes c
      LEFT JOIN turnos t ON c.id = t.cliente_id AND LOWER(t.estado) = 'completado'
      WHERE c.id = ?
      GROUP BY c.id, c.nombre
    `;
    
    db.query(sql, [cliente_id], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

      const cliente = results[0];
      const cantidad_turnos = cliente.cantidad_turnos || 0;
      const meses_cliente = cliente.meses_cliente || 0;

      const sqlDesc = `
        SELECT * FROM descuentos_fidelidad
        WHERE activo = TRUE
        AND (
          (turnos_requeridos > 0 AND turnos_requeridos <= ?)
          OR (meses_requeridos > 0 AND meses_requeridos <= ?)
        )
        ORDER BY porcentaje DESC
        LIMIT 1
      `;

      db.query(sqlDesc, [cantidad_turnos, meses_cliente], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const descuento = results.length > 0 ? results[0] : null;
        res.json({
          cliente: cliente,
          descuento_aplicable: descuento,
          porcentaje: descuento ? descuento.porcentaje : 0
        });
      });
    });
  });

  // CREAR DESCUENTO
  router.post('/', (req, res) => {
    const { nombre, porcentaje, turnos_requeridos, meses_requeridos, descripcion } = req.body;
    
    if (!nombre || !porcentaje) {
      return res.status(400).json({ error: 'Nombre y porcentaje son obligatorios' });
    }

    const sql = `INSERT INTO descuentos_fidelidad 
      (nombre, porcentaje, turnos_requeridos, meses_requeridos, descripcion) 
      VALUES (?, ?, ?, ?, ?)`;
    
    db.query(
      sql,
      [nombre, porcentaje, turnos_requeridos || 0, meses_requeridos || 0, descripcion || null],
      (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ 
          mensaje: '✅ Descuento creado correctamente', 
          id: result.insertId 
        });
      }
    );
  });

  // ACTUALIZAR DESCUENTO
  router.put('/:id', (req, res) => {
    const { nombre, porcentaje, turnos_requeridos, meses_requeridos, descripcion, activo } = req.body;
    
    const sql = `UPDATE descuentos_fidelidad SET 
      nombre = ?, 
      porcentaje = ?, 
      turnos_requeridos = ?, 
      meses_requeridos = ?, 
      descripcion = ?,
      activo = ?
      WHERE id = ?`;
    
    db.query(
      sql,
      [
        nombre, 
        porcentaje, 
        turnos_requeridos || 0, 
        meses_requeridos || 0, 
        descripcion || null,
        activo !== undefined ? activo : true,
        req.params.id
      ],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ mensaje: '✅ Descuento actualizado correctamente' });
      }
    );
  });

  // ELIMINAR DESCUENTO
  router.delete('/:id', (req, res) => {
    const sql = 'UPDATE descuentos_fidelidad SET activo = FALSE WHERE id = ?';
    db.query(sql, [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ mensaje: '✅ Descuento desactivado correctamente' });
    });
  });

  return router;
};
